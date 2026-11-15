import type { Report, ReportFailure, ReportTest } from "#shared/contract/index.ts";

export type FlatCell = { test: ReportTest; cell: ReportTest["cells"][number] };

// Every cell of the matrix, a test on one harness, in report order.
export const cellsOf = (report: Report): FlatCell[] =>
  report.tests.flatMap((test) => test.cells.map((cell) => ({ test, cell })));

// “payments › context budget”, or the check's name for ctxray's own.
export const titleOf = (test: ReportTest) => [...test.suites, test.name].filter((part) => part !== "").join(" › ");

// The failure as plain lines: its message, its labelled lines, and the problems it lists.
export const failureText = (failure: ReportFailure, label: (key: string) => string): string[] => [
  ...(failure.message === "" ? [] : [failure.message]),
  ...failure.lines.map((line) => `${label(line.label)}: ${line.value}`),
  ...(failure.problems ?? []).map((problem) => {
    const where = problem.path === undefined ? "" : `${problem.path}${problem.line ? `:${problem.line}` : ""}: `;
    return `${where}${problem.message}${problem.rule ? ` (${problem.rule})` : ""}`;
  }),
  ...(failure.where ? [failure.where] : []),
];
