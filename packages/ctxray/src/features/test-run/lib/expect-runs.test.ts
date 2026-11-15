import { expect as bunExpect, describe, test } from "bun:test";
import type { Threshold } from "#shared/stats/index.ts";
import { checkBroken, judgeScenario, settle } from "./evals.ts";
import { expect } from "./expect.ts";
import { CheckFailure, Inconclusive } from "./failure.ts";
import { type Run, runsOf } from "./runs.ts";
import { scopeIn } from "./scope.fixture.ts";
import { inCell } from "./scope.ts";

const run = (skills: string[], rules: string[] = [], error?: Run["error"]): Run => ({
  kind: "run",
  prompt: "Refund order 123",
  sample: 1,
  skills: skills.map((name) => ({ name, path: `.claude/skills/${name}/SKILL.md`, tokens: 10 })),
  rules,
  tools: [],
  changed: [],
  added: [],
  turns: 2,
  cut: true,
  loadout: undefined,
  snapshot: undefined,
  error,
});

const times = (count: number, make: () => Run) => Array.from({ length: count }, make);
const BROKEN = { kind: "error" as const, message: "crashed", where: undefined };

const outcome = async (check: () => void): Promise<(string | string[])[]> => {
  const scope = await scopeIn("claude-code");
  try {
    inCell(scope, check);
    settle(scope);
    return ["passed", scope.stats.map((stat) => stat.subject)];
  } catch (error) {
    if (error instanceof Inconclusive) return ["inconclusive", error.key];
    if (error instanceof CheckFailure) return ["failed", error.key];
    throw error;
  }
};

describe("toActivate", () => {
  test.each<[string, Run[], (runs: readonly Run[]) => void, (string | string[])[]]>([
    [
      "19 of 20 clear min 0.75",
      [...times(19, () => run(["refunds"])), run([])],
      (runs) => expect(runs).skill("refunds").toActivate({ min: 0.75 }),
      ["passed", ["skill(refunds)"]],
    ],
    [
      "14 of 20 miss min 0.9",
      [...times(14, () => run(["refunds"])), ...times(6, () => run([]))],
      (runs) => expect(runs).skill("refunds").toActivate({ min: 0.9 }),
      ["failed", "activate.failed"],
    ],
    [
      "10 of 10 can't settle min 0.9 yet",
      times(10, () => run(["refunds"])),
      (runs) => expect(runs).skill("refunds").toActivate(),
      ["inconclusive", "activate.inconclusive"],
    ],
    [
      "a skill that never loads stays under max",
      times(80, () => run(["refunds"])),
      (runs) =>
        expect(runs)
          .skill("payouts")
          .not.toActivate({ max: 0.05 } as Threshold),
      ["passed", ["not skill(payouts)"]],
    ],
    [
      "anyOf counts a rule or a skill by path",
      times(40, () => run([], [".claude/rules/payments.md"])),
      (runs) => expect(runs).anyOf([".claude/rules/payments.md", "nothing.md"]).toActivate({ min: 0.9 }),
      ["passed", ["anyOf(.claude/rules/payments.md, nothing.md)"]],
    ],
    [
      "broken runs count for nothing",
      [...times(40, () => run(["refunds"])), ...times(5, () => run([], [], BROKEN))],
      (runs) => expect(runs).skill("refunds").toActivate({ min: 0.9 }),
      ["passed", ["skill(refunds)"]],
    ],
    [
      "a failure wins over an earlier inconclusive check",
      times(10, () => run(["refunds"])),
      (runs) => {
        expect(runs).skill("refunds").toActivate();
        expect(runs).skill("refunds").not.toActivate();
      },
      ["failed", "activate.failed"],
    ],
    ["only runs", [], () => expect({}).skill("refunds").toActivate(), ["failed", "activate.notRuns"]],
  ])("%s", async (_, runs, check, expected) => {
    bunExpect(await outcome(() => check(runsOf(runs, [], [])))).toEqual(expected);
  });

  test("every run broken fails with the first one's failure", () => {
    bunExpect(() => checkBroken([run([], [], BROKEN)])).toThrow("failed");
  });
});

describe("judgeScenario", () => {
  const passes = async (run: Run) => {
    if (run.skills.length === 0) throw new CheckFailure("expect.failed", { call: "expect(run)" });
  };

  test.each<[string, Run[], number | undefined, string]>([
    ["every run passes", times(3, () => run(["refunds"])), undefined, "passed"],
    ["one run fails without min", [run(["refunds"]), run([])], undefined, "failed"],
    ["a share of runs clears min", [...times(40, () => run(["refunds"])), run([])], 0.8, "passed"],
    ["too few runs to tell", [...times(4, () => run(["refunds"])), run([])], 0.6, "inconclusive"],
    ["a broken run fails", [run(["refunds"], [], BROKEN)], undefined, "failed"],
  ])("%s", async (_, runs, min, expected) => {
    const scope = await scopeIn("claude-code");
    try {
      await judgeScenario(runs, scope, min, passes);
      settle(scope);
      bunExpect("passed").toBe(expected);
    } catch (error) {
      bunExpect(error instanceof Inconclusive ? "inconclusive" : "failed").toBe(expected);
    }
  });
});
