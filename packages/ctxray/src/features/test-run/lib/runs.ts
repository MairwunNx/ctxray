import type { MadeCall } from "#entities/proxy/index.ts";
import type { LoadoutSnapshot, SkillEntry } from "#shared/contract/index.ts";
import type { Failure } from "./attempt.ts";
import type { CapturedLoadout } from "./captured.ts";

// One session of L6 or L7: the agent got a prompt and worked on it until it stopped or ctxray stopped it.
export type Run = {
  kind: "run";
  prompt: string;
  sample: number; // 1-based, within its prompt
  skills: readonly SkillEntry[]; // skills whose body reached the model
  rules: readonly string[]; // rule and instruction files that reached the model, by path
  tools: readonly MadeCall[]; // the agent's trajectory: every tool call, oldest first
  changed: readonly string[]; // files the agent changed, relative to the project root
  turns: number; // model turns the harness asked for
  cut: boolean; // ctxray answered the last turn in the model's place
  loadout: CapturedLoadout | undefined; // the last request: the peak context of the session
  snapshot: LoadoutSnapshot | undefined;
  added: readonly string[]; // rules and skills that joined after the first request
  error?: Failure | undefined; // the session itself failed: the harness crashed, a cassette ran out
};

// The runs of a test, all of them, and by the corpus they came from.
export type Runs = readonly Run[] & { readonly positive: readonly Run[]; readonly negative: readonly Run[] };

export const runsOf = (all: readonly Run[], positive: readonly Run[], negative: readonly Run[]): Runs =>
  Object.assign([...all], { positive, negative });

export const isRunList = (value: unknown): value is readonly Run[] =>
  Array.isArray(value) && value.every((item) => (item as { kind?: unknown })?.kind === "run");
