import type { Exchange, Handler, Incoming } from "./model.ts";
import { KITS } from "./protocols/index.ts";

export type RelayOptions = {
  maxTurns: number; // model turns that reach `inner`. Later ones get a closing word from ctxray instead
  onExchange?: (exchange: Exchange) => void;
  refuse?: () => string | undefined; // a reason to stop forwarding, like a spent budget
};

export type Relay = {
  handler: Handler;
  turn: (position: number) => Promise<Exchange>; // resolves when the harness sends that turn
  turns: () => readonly Exchange[];
  cut: () => boolean; // whether ctxray answered a turn in the model's place
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

const CLOSING = "That's all for now.";

// A session whose model answers by itself: a real one through the upstream, or a cassette. ctxray watches the
// turns go by, and past `maxTurns` it answers in the model's place, so an agent that wanders off still ends.
export const createRelay = (inner: Handler, { maxTurns, onExchange = () => {}, refuse }: RelayOptions): Relay => {
  const turns = new Map<number, Exchange>();
  const arrivals = new Map<number, PromiseWithResolvers<Exchange>>();
  const arrival = (position: number) => {
    const entry = arrivals.get(position) ?? Promise.withResolvers<Exchange>();
    arrivals.set(position, entry);
    return entry;
  };
  let seq = 0;
  let cut = false;

  const handler: Handler = async (incoming) => {
    const kit = KITS[incoming.protocol];
    const isTurn = incoming.route === "turn" && kit.hasTools(incoming.body);
    const position = isTurn ? kit.position(incoming.body) : undefined;
    const known = position === undefined ? undefined : turns.get(position);
    if (known) known.retries++;
    else {
      const exchange = recordOf(incoming, seq++, position);
      onExchange(exchange);
      if (position !== undefined) {
        turns.set(position, exchange);
        arrival(position).resolve(exchange);
      }
    }
    if (position !== undefined && position >= maxTurns) {
      cut = true;
      return kit.reply({ text: CLOSING }, incoming.body, incoming.stream);
    }
    const refused = refuse?.();
    if (refused !== undefined) return kit.error(429, `ctxray: ${refused}`);
    return inner(incoming);
  };

  return {
    handler,
    turn: (position) => arrival(position).promise,
    turns: () => [...turns.values()].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    cut: () => cut,
  };
};
