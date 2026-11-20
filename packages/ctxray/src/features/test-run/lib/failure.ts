import { createTranslator, DEFAULT_LANG, type MessageKey, type Params } from "#shared/i18n/index.ts";

const english = createTranslator(DEFAULT_LANG);

// One labelled line under a failure, like “Missing  .claude/rules/payments.md”.
export type FailureLine = { label: MessageKey; value: string };

// A failure ctxray words in the user's language. Its message reads in English for whoever sees the raw error,
// like a test file run with plain bun.
export class CheckFailure extends Error {
  readonly key: MessageKey;
  readonly params: Params;
  readonly lines: readonly FailureLine[];

  constructor(key: MessageKey, params: Params = {}, lines: readonly FailureLine[] = []) {
    super(english(key, params));
    this.name = "CheckFailure";
    this.key = key;
    this.params = params;
    this.lines = lines;
  }
}

// L6 and L7 throw it when the samples can't tell a pass from a fail yet.
export class Inconclusive extends CheckFailure {}

export const fail = (key: MessageKey, params?: Params, lines?: readonly FailureLine[]): never => {
  throw new CheckFailure(key, params, lines);
};

const TAIL_LINES = 12;
const LINE_LENGTH = 300;

// The end of a harness's output. Each line is cut short: one stream-json event alone can run to kilobytes.
export const tailOf = (output: string) =>
  output
    .split("\n")
    .slice(-TAIL_LINES)
    .map((line) => (line.length > LINE_LENGTH ? `${line.slice(0, LINE_LENGTH)}…` : line))
    .join("\n") || "—";

// Strings get quotes, so `"5"` and `5` look different, the rest prints the way Bun logs it.
export const show = (value: unknown): string =>
  typeof value === "string" ? JSON.stringify(value) : Bun.inspect(value, { depth: 3 }).replace(/\s*\n\s*/g, " ");
