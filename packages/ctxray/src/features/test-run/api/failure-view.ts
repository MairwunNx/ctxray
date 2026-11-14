import type { Problem } from "#entities/harness/index.ts";
import { type Line, span, type Tone, type View, widthOf } from "#shared/render/index.ts";
import type { Failure } from "../lib/attempt.ts";
import type { CellResult } from "../lib/run.ts";
import type { TestRunResult } from "../test-run.action.ts";
import { headingOf, LAYER_WORDS, nameOf, shown, type Words } from "./words.ts";

const INDENT = "     ";
const SHOWN = 10;

const text = (value: string, tone: Tone = "plain"): Line => [span(`${INDENT}${value}`, tone)];

const capped = (lines: Line[], words: Words): Line[] =>
  lines.length > SHOWN
    ? [...lines.slice(0, SHOWN), text(words.t("test.more", { count: lines.length - SHOWN }), "muted")]
    : lines;

const problemLine = (problem: Problem, words: Words): Line => {
  const where = problem.line === undefined ? problem.path : `${problem.path}:${problem.line}`;
  const tone = problem.severity === "error" ? "failure" : "warning";
  return [span(`${INDENT}${where}`, tone), span(`  ${words.t(problem.key, problem.params)}`)];
};

// The lines under a failure's title, in the user's language.
export const failureLines = (failure: Failure, words: Words): View => {
  const { t, clean } = words;
  switch (failure.kind) {
    case "check": {
      const labels = failure.lines.map((line) => t(line.label));
      const width = Math.max(0, ...labels.map(widthOf));
      return [
        text(t(failure.key, failure.params)),
        ...failure.lines.map((line, index): Line => {
          const label = labels[index] ?? "";
          return [span(`${INDENT}${label}${" ".repeat(width - widthOf(label))}  `, "muted"), span(clean(line.value))];
        }),
      ];
    }
    case "error":
      return [
        text(clean(failure.message)),
        ...(failure.where === undefined ? [] : [text(shown(words.cwd, failure.where), "muted")]),
      ];
    case "problems":
      return capped(
        failure.problems.map((problem) => problemLine(problem, words)),
        words,
      );
    case "findings":
      return capped(
        failure.findings.map((finding) => text(t(finding.key, finding.params))),
        words,
      );
  }
};

const MARKS: Record<CellResult["status"], [string, Tone]> = {
  failed: ["✗", "failure"],
  flaky: ["~", "warning"],
  inconclusive: ["~", "warning"],
  passed: ["⚠", "warning"],
  skipped: ["○", "muted"],
};

const titleOf = (cell: CellResult, words: Words) => {
  const where = cell.file === undefined ? `${cell.layer} ${LAYER_WORDS[cell.layer]}` : headingOf(cell, words);
  const name = nameOf(cell, words);
  return [cell.harness, where, ...(name === "" ? [] : [name])].join(" › ");
};

// Every cell with something to say: failures, flaky passes, and warnings of ctxray's own checks.
export const failuresView = (result: TestRunResult, words: Words): View => {
  const broken = result.broken.flatMap(
    ({ file, failure }): View => [
      [span(` ✗ ${shown(words.cwd, file)}`, "failure"), span(`  ${words.t("test.broken")}`, "muted")],
      ...failureLines(failure, words),
      [],
    ],
  );
  const cells = result.results
    .filter((cell) => cell.failure && cell.status !== "skipped")
    .flatMap((cell): View => {
      const [mark, tone] = MARKS[cell.status];
      return [[span(` ${mark} ${titleOf(cell, words)}`, tone)], ...failureLines(cell.failure as Failure, words), []];
    });
  return [...broken, ...cells];
};
