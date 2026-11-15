import type { Answer } from "./forward.ts";
import type { Exchange, Handler } from "./model.ts";
import { KITS } from "./protocols/index.ts";

// One answer of a recorded session. A turn plays back by its position in the conversation, anything else by
// its route, in the order it came.
export type TapeEntry = {
  path: string;
  position?: number | undefined;
  status: number;
  contentType: string;
  body: string;
};

// The session's project copy lives in a new temporary folder each run, so a tape names it by a placeholder.
export const WORK = "<work>";

const hide = (text: string, dirs: readonly string[]) =>
  dirs.filter((dir) => dir !== "").reduce((at, dir) => at.replaceAll(dir, WORK), text);

// Answers of the real model, as the forward hands them over: pass both hooks to createForward(). `dirs` gives
// the folders the session works in.
export const createRecorder = (dirs: () => readonly string[], clean: (text: string) => string = (text) => text) => {
  const entries: { seq: number; entry: TapeEntry }[] = [];
  const pending = new Map<number, PromiseWithResolvers<void>>();
  return {
    onExchange: (exchange: Exchange) => {
      pending.set(exchange.seq, Promise.withResolvers<void>());
    },
    onAnswer: (exchange: Exchange, answer: Answer) => {
      const entry: TapeEntry = {
        path: exchange.path,
        ...(exchange.position !== undefined && { position: exchange.position }),
        status: answer.status,
        contentType: answer.contentType,
        body: clean(hide(answer.text, dirs())),
      };
      entries.push({ seq: exchange.seq, entry });
      pending.get(exchange.seq)?.resolve();
    },
    // Waits for the answers still streaming to the harness.
    tape: async (): Promise<TapeEntry[]> => {
      await Promise.all([...pending.values()].map((one) => one.promise));
      return entries.toSorted((a, b) => a.seq - b.seq).map(({ entry }) => entry);
    },
  };
};

export type Miss = { path: string; position: number | undefined };

// Plays a tape back. A request the tape has no answer for gets a protocol error and a call to `onMiss`: the
// harness went another way than when the tape was recorded.
export const createPlayer = (tape: readonly TapeEntry[], work: () => string, onMiss: (miss: Miss) => void): Handler => {
  const turns = new Map<number, TapeEntry>();
  const sides = new Map<string, TapeEntry[]>();
  for (const entry of tape) {
    if (entry.position !== undefined) turns.set(entry.position, entry);
    else sides.set(entry.path, [...(sides.get(entry.path) ?? []), entry]);
  }
  const used = new Map<string, number>();
  return async (incoming) => {
    const kit = KITS[incoming.protocol];
    const isTurn = incoming.route === "turn" && kit.hasTools(incoming.body);
    const position = isTurn ? kit.position(incoming.body) : undefined;
    let entry: TapeEntry | undefined;
    if (position !== undefined) entry = turns.get(position);
    else {
      // Side calls repeat their last answer once the tape runs out of them.
      const list = sides.get(incoming.path) ?? [];
      const index = used.get(incoming.path) ?? 0;
      used.set(incoming.path, index + 1);
      entry = list[Math.min(index, list.length - 1)];
    }
    if (!entry) {
      onMiss({ path: incoming.path, position });
      return kit.error(404, `ctxray: the cassette holds no answer for ${incoming.path} at turn ${position ?? "—"}`);
    }
    return new Response(entry.body.replaceAll(WORK, work()), {
      status: entry.status,
      headers: { "content-type": entry.contentType },
    });
  };
};
