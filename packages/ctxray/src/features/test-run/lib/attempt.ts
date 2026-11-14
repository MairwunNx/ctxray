import type { Finding, Problem } from "#entities/harness/index.ts";
import type { TestStatus } from "#shared/contract/index.ts";
import type { MessageKey, Params } from "#shared/i18n/index.ts";
import { CheckFailure, type FailureLine, Inconclusive } from "./failure.ts";

// Why a test didn't pass: a check ctxray words itself, an error the test threw, or what L1 and L2 found.
export type Failure =
  | { kind: "check"; key: MessageKey; params: Params; lines: readonly FailureLine[] }
  | { kind: "error"; message: string; where: string | undefined }
  | { kind: "problems"; problems: readonly Problem[] }
  | { kind: "findings"; findings: readonly Finding[] };

// The first stack frame outside ctxray points at the user's line.
const whereOf = (error: Error) =>
  error.stack
    ?.split("\n")
    .map((line) => /\(?((?:file:\/\/)?\/[^()]+\.ctxray\.[mc]?[jt]s(?:\?[^:]*)?:\d+:\d+)\)?$/.exec(line.trim())?.[1])
    .find((frame) => frame !== undefined)
    ?.replace(/^file:\/\//, "")
    .replace(/\?[^:]*/, "");

// Bun's shell errors say only “Failed with exit code 1”: the command's own complaint is in its stderr.
const messageOf = (error: Error) => {
  const stderr = (error as { stderr?: unknown }).stderr;
  const said = stderr instanceof Uint8Array ? new TextDecoder().decode(stderr).trim().split("\n").at(-1) : undefined;
  return said ? `${error.message}: ${said}` : error.message;
};

export const toFailure = (error: unknown): Failure => {
  if (error instanceof CheckFailure) return { kind: "check", key: error.key, params: error.params, lines: error.lines };
  if (error instanceof Error) return { kind: "error", message: messageOf(error), where: whereOf(error) };
  return { kind: "error", message: String(error), where: undefined };
};

export const DEFAULT_TIMEOUT = 30_000;

const withTimeout = async (run: () => unknown, timeout: number) => {
  let timer: Timer | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new CheckFailure("test.timeout", { ms: timeout })), timeout);
  });
  try {
    await Promise.race([Promise.resolve().then(run), late]);
  } finally {
    clearTimeout(timer);
  }
};

export type Outcome = { status: TestStatus; failure?: Failure; attempts: number };

// A pass after a failed attempt is flaky: green, but worth a look.
export const attempt = async (
  run: () => unknown,
  { retries = 0, timeout = DEFAULT_TIMEOUT } = {},
): Promise<Outcome> => {
  let failure: Failure | undefined;
  for (let attempts = 1; attempts <= retries + 1; attempts++) {
    try {
      await withTimeout(run, timeout);
      return failure ? { status: "flaky", failure, attempts } : { status: "passed", attempts };
    } catch (error) {
      if (error instanceof Inconclusive) return { status: "inconclusive", failure: toFailure(error), attempts };
      failure = toFailure(error);
    }
  }
  return { status: "failed", ...(failure ? { failure } : {}), attempts: retries + 1 };
};
