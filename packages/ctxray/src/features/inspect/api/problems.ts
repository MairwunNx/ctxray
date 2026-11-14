import { type Problem, ruleOf } from "#entities/harness/index.ts";
import type { Translate } from "#shared/i18n/index.ts";
import { type Line, span, type View } from "#shared/render/index.ts";
import type { InspectedHarness } from "../inspection.ts";

export type Message = (problem: Problem) => string;

// Lint covers the whole repository. In a monorepo package only the files under the cwd and the files the
// agent loads matter, the rest gets counted in one line.
const isRelevant = (harness: InspectedHarness) => {
  const loaded = new Set(Object.values(harness.provenance).map(({ source }) => source));
  const { cwd } = harness;
  return ({ path }: Problem) => cwd === "" || path.startsWith(`${cwd}/`) || loaded.has(path);
};

const problemLine = (problem: Problem, message: Message): Line => [
  span("   "),
  problem.severity === "error" ? span("✗ ", "failure") : span("⚠ ", "warning"),
  span(problem.line === undefined ? problem.path : `${problem.path}:${problem.line}`, "accent"),
  span(`  ${message(problem)}`),
  // The check's id, as the config names it in `lint.rules`.
  ...(ruleOf(problem.key) ? [span(`  ${ruleOf(problem.key)}`, "muted")] : []),
];

export const problemsView = (harness: InspectedHarness, t: Translate, message: Message): View => {
  const relevant = harness.problems.filter(isRelevant(harness));
  const elsewhere = harness.problems.length - relevant.length;
  const lines: View = [
    ...relevant.map((problem) => problemLine(problem, message)),
    ...(elsewhere > 0 ? [[span(`   ${t("inspect.elsewhere", { count: elsewhere })}`, "muted")]] : []),
  ];
  return lines.length > 0 ? [[], ...lines] : [];
};
