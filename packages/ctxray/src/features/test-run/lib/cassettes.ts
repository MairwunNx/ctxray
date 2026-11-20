import { mkdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { type TapeEntry, WORK } from "#entities/proxy/index.ts";
import type { HarnessId } from "#shared/contract/index.ts";

export const CASSETTE_VERSION = 1;

// One recorded session: the harness version and model it ran with, and the model's answers.
export type Tape = { version: string; model: string; entries: TapeEntry[] };

type CassetteFile = { schemaVersion: number; harness: HarnessId; work: string; tapes: Record<string, Tape> };

// A test file's cassettes live next to it, a file per harness: `__cassettes__/refunds.ctxray.ts.claude-code.json`.
export const cassettePath = (file: string, harness: HarnessId) =>
  join(dirname(file), "__cassettes__", `${basename(file)}.${harness}.json`);

const sorted = <T>(record: Record<string, T>) =>
  Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));

export const createCassettes = () => {
  const files = new Map<string, { tapes: Record<string, Tape>; dirty: boolean }>();
  let skipped = 0;
  const fileOf = async (path: string) => {
    const known = files.get(path);
    if (known) return known;
    const handle = Bun.file(path);
    const parsed = (await handle.exists()) ? ((await handle.json()) as CassetteFile) : undefined;
    const loaded = {
      tapes: parsed?.schemaVersion === CASSETTE_VERSION ? parsed.tapes : {},
      dirty: false,
    };
    files.set(path, loaded);
    return loaded;
  };
  return {
    get: async (file: string, harness: HarnessId, key: string): Promise<Tape | undefined> =>
      (await fileOf(cassettePath(file, harness))).tapes[key],
    put: async (file: string, harness: HarnessId, key: string, tape: Tape) => {
      const loaded = await fileOf(cassettePath(file, harness));
      loaded.tapes[key] = tape;
      loaded.dirty = true;
    },
    // A recorded session the model's API refused: it gets no tape.
    skip: () => {
      skipped++;
    },
    skipped: () => skipped,
    // Writes what changed, and says how many tapes went to disk.
    save: async (): Promise<number> => {
      let written = 0;
      for (const [path, loaded] of files) {
        if (!loaded.dirty) continue;
        const harness = basename(path, ".json").split(".").at(-1) as HarnessId;
        const file: CassetteFile = {
          schemaVersion: CASSETTE_VERSION,
          harness,
          work: WORK,
          tapes: sorted(loaded.tapes),
        };
        await mkdir(dirname(path), { recursive: true });
        await Bun.write(path, `${JSON.stringify(file, null, 2)}\n`);
        written += Object.keys(loaded.tapes).length;
      }
      return written;
    },
  };
};
export type Cassettes = ReturnType<typeof createCassettes>;
