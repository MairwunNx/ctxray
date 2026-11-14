import type { Exchange, Handler, Incoming, Step } from "./model.ts";
import { KITS, roughTokens } from "./protocols/index.ts";

// The mock backend for one harness session. Each model turn waits for whoever drives the conversation, a test
// or a scenario, to say what the model answers. A turn the harness sends again gets the same answer, so
// retries and the fallback from streaming change nothing (ADR 0004).
export type Conversation = {
  handler: Handler;
  turns: () => readonly Exchange[]; // one per position, the first attempt
  sideCalls: () => readonly Exchange[]; // requests without tools, and routes ctxray doesn't know
  turn: (position: number) => Promise<Exchange>; // resolves when the harness sends that turn
  answer: (position: number, step: Step) => void;
  finish: (step: Step) => void; // answers every open turn, and all later ones, with this
};

const recordOf = (incoming: Incoming, seq: number, position: number | undefined): Exchange => ({
  seq,
  session: incoming.session,
  protocol: incoming.protocol,
  path: incoming.path,
  position,
  retries: 0,
  userAgent: incoming.headers.get("user-agent") ?? undefined,
  headers: Object.fromEntries(incoming.headers.entries()),
  body: incoming.body,
});

const deferredMap = <T>() => {
  const entries = new Map<number, PromiseWithResolvers<T>>();
  return (key: number) => {
    const entry = entries.get(key) ?? Promise.withResolvers<T>();
    entries.set(key, entry);
    return entry;
  };
};

const countReply = (incoming: Incoming) =>
  incoming.protocol === "gemini"
    ? Response.json({ totalTokens: roughTokens(incoming.body) })
    : Response.json({ input_tokens: roughTokens(incoming.body) });

export const createConversation = (onExchange: (exchange: Exchange) => void = () => {}): Conversation => {
  const turns = new Map<number, Exchange>();
  const sideCalls: Exchange[] = [];
  const arrival = deferredMap<Exchange>();
  const answerOf = deferredMap<Step>();
  let finished: Step | undefined;
  let seq = 0;

  const handler: Handler = async (incoming) => {
    const kit = KITS[incoming.protocol];
    if (incoming.route === "turn" && kit.hasTools(incoming.body)) {
      const position = kit.position(incoming.body);
      const known = turns.get(position);
      if (known) {
        known.retries++;
      } else {
        const exchange = recordOf(incoming, seq++, position);
        turns.set(position, exchange);
        onExchange(exchange);
        arrival(position).resolve(exchange);
      }
      if (finished) answerOf(position).resolve(finished);
      return kit.reply(await answerOf(position).promise, incoming.body, incoming.stream);
    }
    const side = recordOf(incoming, seq++, undefined);
    sideCalls.push(side);
    onExchange(side);
    if (incoming.route === "turn") return kit.reply({ text: "ok" }, incoming.body, incoming.stream);
    if (incoming.route === "count") return countReply(incoming);
    if (incoming.route === "models") return Response.json({ object: "list", data: [] });
    if (incoming.route === "analytics") return Response.json({});
    return kit.error(404, `ctxray: unknown route ${incoming.method} ${incoming.path}`);
  };

  return {
    handler,
    turns: () => [...turns.values()].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    sideCalls: () => sideCalls,
    turn: (position) => arrival(position).promise,
    answer: (position, step) => answerOf(position).resolve(step),
    finish: (step) => {
      finished = step;
      for (const position of turns.keys()) answerOf(position).resolve(step);
    },
  };
};
