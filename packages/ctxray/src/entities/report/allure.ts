import type { Report } from "#shared/contract/index.ts";
import { cellsOf, failureText, titleOf } from "./cells.ts";

const STATUS = {
  passed: "passed",
  flaky: "passed",
  failed: "failed",
  skipped: "skipped",
  inconclusive: "unknown",
} as const;

const hash = (text: string) => new Bun.CryptoHasher("md5").update(text).digest("hex");

// allure-results: a result file per test and harness, the categories ctxray's statuses fall into, and the
// run's environment. Allure TestOps and `allure generate` read the folder as it is.
export const toAllure = (report: Report, label: (key: string) => string): Record<string, string> => {
  const files: Record<string, string> = {};
  const stop = Date.parse(report.createdAt);
  for (const { test, cell } of cellsOf(report)) {
    const uuid = crypto.randomUUID();
    const name = titleOf(test) || test.check || test.name;
    const result = {
      uuid,
      historyId: hash(`${test.id}#${cell.harness}`),
      testCaseId: hash(test.id),
      name: `${name} › ${cell.harness}`,
      fullName: `${test.file ?? "ctxray"}#${name}#${cell.harness}`,
      status: STATUS[cell.status],
      ...(cell.failure && {
        statusDetails: { message: failureText(cell.failure, label).join("\n"), flaky: cell.status === "flaky" },
      }),
      ...(cell.status === "skipped" && { statusDetails: { message: cell.reason ?? "" } }),
      stage: "finished",
      start: stop - cell.duration,
      stop,
      labels: [
        { name: "framework", value: "ctxray" },
        { name: "parentSuite", value: test.file ?? "ctxray" },
        ...(test.suites.length > 0 ? [{ name: "suite", value: test.suites.join(" › ") }] : []),
        { name: "tag", value: test.layer },
        { name: "feature", value: test.layer },
        { name: "story", value: cell.harness },
      ],
      parameters: [{ name: "harness", value: cell.harness }],
    };
    files[`${uuid}-result.json`] = JSON.stringify(result);
  }
  files["categories.json"] = JSON.stringify([
    { name: "Inconclusive statistics", matchedStatuses: ["unknown"] },
    { name: "Resolver drift", messageRegex: ".*(drift|resolver).*", matchedStatuses: ["failed"] },
  ]);
  files["environment.properties"] = [
    `ctxray=${report.ctxray}`,
    `backend=${report.run.backend.kind}`,
    `harnesses=${report.harnesses.map((harness) => harness.id).join(",")}`,
    "",
  ].join("\n");
  return files;
};
