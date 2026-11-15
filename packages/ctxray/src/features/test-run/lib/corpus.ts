import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { collecting } from "./dsl.ts";
import { CheckFailure } from "./failure.ts";

const Prompts = { positive: z.array(z.string()).optional(), negative: z.array(z.string()).optional() };
// `ctxray gen-prompts` adds the model that wrote them, the date, and the prompts of each rule or skill.
const CorpusFile = z.strictObject({
  ...Prompts,
  model: z.string().optional(),
  generated: z.string().optional(),
  by: z.record(z.string(), z.strictObject(Prompts)).optional(),
});

export type Corpus = { readonly positive: readonly string[]; readonly negative: readonly string[] };

// Prompts for L6: a module whose default export (or a JSON file) holds `positive` and `negative` lists.
// The path is relative to the test file. The lists fill in before any test runs, so a test can take them
// as options right away.
export const corpus = (path: string): Corpus => {
  const collector = collecting();
  const file = resolve(dirname(collector.file), path);
  const prompts = { positive: [] as string[], negative: [] as string[] };
  const load = async () => {
    let loaded: unknown;
    try {
      const module = (await import(pathToFileURL(file).href)) as { default?: unknown };
      loaded = module.default ?? module;
    } catch (error) {
      throw new CheckFailure("corpus.unreadable", { file: path, message: (error as Error).message ?? String(error) });
    }
    const parsed = CorpusFile.safeParse(loaded);
    if (!parsed.success) throw new CheckFailure("corpus.invalid", { file: path });
    prompts.positive.push(...(parsed.data.positive ?? []));
    prompts.negative.push(...(parsed.data.negative ?? []));
  };
  // Settled with the error, not rejected: nothing awaits it until the test file finishes loading.
  collector.pending.push(
    load().then(
      () => undefined,
      (error: unknown) => error,
    ),
  );
  return prompts;
};
