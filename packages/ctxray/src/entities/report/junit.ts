import type { Report } from "#shared/contract/index.ts";
import { cellsOf, failureText, titleOf } from "./cells.ts";

// XML 1.0 has no place for most control characters.
const allowed = (char: string) => {
  const code = char.charCodeAt(0);
  return code >= 0x20 || code === 0x09 || code === 0x0a || code === 0x0d;
};

const xml = (text: string) =>
  [...text]
    .filter(allowed)
    .join("")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const seconds = (ms: number) => (ms / 1000).toFixed(3);

// JUnit XML for GitHub and GitLab test reports. A suite per test file, a test case per test and harness.
// Inconclusive statistics count as skipped, with the reason in the message.
export const toJunit = (report: Report, label: (key: string) => string): string => {
  const groups = new Map<string, ReturnType<typeof cellsOf>>();
  for (const one of cellsOf(report)) {
    const name = one.test.file ?? `ctxray ${one.test.check ?? ""}`.trim();
    groups.set(name, [...(groups.get(name) ?? []), one]);
  }
  const suites = [...groups.entries()].map(([name, cells]) => {
    const failures = cells.filter(({ cell }) => cell.status === "failed").length;
    const skipped = cells.filter(({ cell }) => cell.status === "skipped" || cell.status === "inconclusive").length;
    const time = cells.reduce((sum, { cell }) => sum + cell.duration, 0);
    const cases = cells.map(({ test, cell }) => {
      const head = `    <testcase classname="${xml(test.suites.join(" › ") || name)}" name="${xml(`[${test.layer}] ${titleOf(test) || test.check || ""} › ${cell.harness}`)}" time="${seconds(cell.duration)}"`;
      const text = cell.failure ? failureText(cell.failure, label).join("\n") : "";
      if (cell.status === "failed") {
        const message = text.split("\n")[0] ?? "";
        return `${head}>\n      <failure message="${xml(message)}">${xml(text)}</failure>\n    </testcase>`;
      }
      if (cell.status === "skipped")
        return `${head}>\n      <skipped message="${xml(cell.reason ?? "")}"/>\n    </testcase>`;
      if (cell.status === "inconclusive") {
        return `${head}>\n      <skipped message="${xml(`inconclusive: ${text.split("\n")[0] ?? ""}`)}"/>\n    </testcase>`;
      }
      if (cell.status === "flaky")
        return `${head}>\n      <system-out>flaky: ${cell.attempts} attempts</system-out>\n    </testcase>`;
      return `${head}/>`;
    });
    return [
      `  <testsuite name="${xml(name)}" tests="${cells.length}" failures="${failures}" skipped="${skipped}" time="${seconds(time)}">`,
      ...cases,
      "  </testsuite>",
    ].join("\n");
  });
  const { summary } = report;
  const total = summary.passed + summary.failed + summary.skipped + summary.inconclusive + summary.flaky;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuites name="ctxray" tests="${total}" failures="${summary.failed}" skipped="${summary.skipped + summary.inconclusive}" time="${seconds(report.run.duration)}">`,
    ...suites,
    "</testsuites>",
    "",
  ].join("\n");
};
