import pMap from "p-map";
import type { Config } from "#entities/user-config/index.ts";
import { judge } from "#shared/stats/index.ts";
import { type Failure, toFailure } from "./attempt.ts";
import { runSample } from "./autonomous.ts";
import type { Backend } from "./backend.ts";
import type { Capture } from "./capture.ts";
import { fail, Inconclusive } from "./failure.ts";
import type { TestDefinition } from "./model.ts";
import { type Run, runsOf } from "./runs.ts";
import type { CellScope } from "./scope.ts";

export type EvalContext = {
  capture: Capture;
  backend: Backend;
  concurrency: number;
  activate: Config["activate"]; // the config's L6 defaults
};

// A scenario runs once a prompt. L6 gives each group of prompts, the positive and the negative ones, the
// config's `activate.runs`, split between the group's prompts: each group's rate gets enough runs to be proved.
const SCENARIO_SAMPLES = 1;
// A skill loads one turn after the model asks for it, a rule after a read: two turns tell. A scenario needs room.
export const DEFAULT_TURNS = { activate: 2, scenario: 30 } as const;
export const SAMPLE_TIMEOUT = 300_000;

type Prompt = { group: "prompt" | "positive" | "negative"; index: number; text: string };

const promptsOf = (definition: TestDefinition): Prompt[] => {
  const { prompt, positive = [], negative = [] } = definition.options;
  return [
    ...(prompt === undefined ? [] : [{ group: "prompt" as const, index: 0, text: prompt }]),
    ...positive.map((text, index) => ({ group: "positive" as const, index, text })),
    ...negative.map((text, index) => ({ group: "negative" as const, index, text })),
  ];
};

// Every prompt, `samples` times each, a few sessions side by side. A sample's tape is named by its prompt and
// number, so a cassette survives a reworded test name only as long as its key holds.
export const collectRuns = async (definition: TestDefinition, key: string, scope: CellScope, context: EvalContext) => {
  const kind = definition.kind === "scenario" ? "scenario" : "activate";
  const prompts = promptsOf(definition);
  if (prompts.length === 0) fail("activate.noPrompts");
  const samplesOf = (prompt: Prompt) =>
    definition.options.samples ??
    (kind === "scenario"
      ? SCENARIO_SAMPLES
      : Math.ceil(context.activate.runs / prompts.filter((one) => one.group === prompt.group).length));
  const jobs = prompts.flatMap((prompt) =>
    Array.from({ length: samplesOf(prompt) }, (_, at) => ({ prompt, sample: at + 1 })),
  );
  const runs = await pMap(
    jobs,
    async ({ prompt, sample }) => {
      const tape = {
        file: definition.file,
        harness: scope.harness,
        key: `${key} › ${prompt.group}${prompt.index} #${sample}`,
      };
      const backend = await context.backend.sample(tape, definition.options.turns ?? DEFAULT_TURNS[kind]);
      const run = await runSample(context.capture, scope, backend, {
        cwd: definition.options.cwd ?? "",
        prompt: prompt.text,
        sample,
        timeout: definition.options.timeout ?? SAMPLE_TIMEOUT,
      });
      return { group: prompt.group, run };
    },
    { concurrency: context.concurrency },
  );
  const of = (group: Prompt["group"]) => runs.filter((one) => one.group === group).map((one) => one.run);
  return runsOf(
    runs.map((one) => one.run),
    of("positive"),
    of("negative"),
  );
};

// A failure ctxray already worded, carried up to the test's result as it is.
export class FailedWith extends Error {
  readonly failure: Failure;
  constructor(failure: Failure) {
    super("failed");
    this.failure = failure;
  }
}

// Sessions that broke say nothing about the model, and L6 leaves them out. When every one broke, the first
// one's failure is the test's.
export const checkBroken = (runs: readonly Run[]) => {
  const broken = runs.filter((run) => run.error !== undefined);
  if (broken.length === runs.length && broken[0]?.error) throw new FailedWith(broken[0].error);
};

// L7: the body checks each run, and the share of runs it passed decides. Without `min`, every run must pass.
export const judgeScenario = async (
  runs: readonly Run[],
  scope: CellScope,
  min: number | undefined,
  check: (run: Run) => Promise<void>,
) => {
  const failures: { run: Run; failure: Failure }[] = [];
  for (const run of runs) {
    if (run.error) {
      failures.push({ run, failure: run.error });
      continue;
    }
    try {
      await check(run);
    } catch (error) {
      failures.push({ run, failure: toFailure(error) });
    }
  }
  const first = failures[0];
  if (min === undefined) {
    if (first) throw new FailedWith(first.failure);
    return;
  }
  const threshold = { min };
  const judged = judge(runs.length - failures.length, runs.length, threshold);
  scope.stats.push({ ...judged, subject: "scenario", threshold });
  if (judged.verdict === "failed" && first) throw new FailedWith(first.failure);
};

// After the body: a rate the samples couldn't settle makes the test inconclusive, with the samples it needs.
export const settle = (scope: CellScope) => {
  const open = scope.stats.filter((stat) => stat.verdict === "inconclusive");
  const [first] = open;
  if (!first) return;
  throw new Inconclusive(
    "activate.inconclusive",
    { subject: first.subject, rate: first.rate.toFixed(2), low: first.low.toFixed(2), high: first.high.toFixed(2) },
    open.map((stat) => ({
      label: "activate.needed" as const,
      value: `${stat.subject}: ${stat.needed === undefined ? "—" : String(stat.needed)}`,
    })),
  );
};
