import { judge, type Threshold } from "#shared/stats/index.ts";
import { CheckFailure, fail, show } from "./failure.ts";
import { isRuleSet, type RuleSet, selectRules } from "./rules.ts";
import { isRunList, type Run } from "./runs.ts";
import { currentCell } from "./scope.ts";

const DEFAULT_MIN = 0.9;
const DEFAULT_MAX = 0.1;

const fixed = (value: number) => value.toFixed(2);
const thresholdText = (threshold: Threshold) => ("min" in threshold ? `min ${threshold.min}` : `max ${threshold.max}`);

// Counts the runs that loaded the subject and holds the rate to the threshold: a failure throws at once, an
// inconclusive rate waits for the test to end, so one unsettled check doesn't hide a failed one.
const activation = (runs: readonly Run[], subject: string, loaded: (run: Run) => boolean) => {
  const toActivate = (negated: boolean) => (threshold?: Threshold) => {
    const settled = threshold ?? (negated ? { max: DEFAULT_MAX } : { min: DEFAULT_MIN });
    const counted = runs.filter((run) => run.error === undefined);
    const judged = judge(counted.filter(loaded).length, counted.length, settled);
    const named = negated ? `not ${subject}` : subject;
    currentCell().stats.push({ ...judged, subject: named, threshold: settled });
    if (judged.verdict !== "failed") return;
    throw new CheckFailure(
      "activate.failed",
      { subject: named, rate: fixed(judged.rate), low: fixed(judged.low), high: fixed(judged.high) },
      [
        { label: "activate.runs", value: `${judged.successes} / ${judged.samples}` },
        { label: "activate.threshold", value: thresholdText(settled) },
      ],
    );
  };
  return { toActivate: toActivate(false), not: { toActivate: toActivate(true) } };
};

const pathsOf = (set: RuleSet | readonly string[]) =>
  isRuleSet(set) ? selectRules(currentCell(), set).map((rule) => rule.path) : [...set];

// `expect(runs).skill("refunds").toActivate({ min: 0.9 })`, and the same for a rule or any of a set.
export const runMatchers = (actual: unknown) => {
  const runs = (matcher: string): readonly Run[] =>
    isRunList(actual) ? actual : fail("activate.notRuns", { matcher, received: show(actual) });
  return {
    skill: (name: string) =>
      activation(runs("skill()"), `skill(${name})`, (run) => run.skills.some((skill) => skill.name === name)),
    rule: (path: string) => activation(runs("rule()"), `rule(${path})`, (run) => run.rules.includes(path)),
    anyOf: (set: RuleSet | readonly string[]) => {
      const paths = pathsOf(set);
      if (paths.length === 0) fail("activate.emptySet");
      const shown = paths.length > 3 ? `${paths.slice(0, 3).join(", ")}, …` : paths.join(", ");
      return activation(
        runs("anyOf()"),
        `anyOf(${shown})`,
        (run) =>
          run.rules.some((path) => paths.includes(path)) ||
          run.skills.some((skill) => paths.includes(skill.path) || paths.includes(skill.name)),
      );
    },
  };
};
