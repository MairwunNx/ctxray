import { expect, test } from "bun:test";
import { Report } from "#shared/contract/index.ts";
import { createTranslator } from "#shared/i18n/index.ts";
import { toAllure } from "./allure.ts";
import { toJunit } from "./junit.ts";
import { toMarkdown } from "./markdown.ts";
import { REPORT } from "./report.fixture.ts";

const t = createTranslator("en");
const label = (key: string) => t(key as never);

test("the fixture is a valid report", () => {
  expect(Report.safeParse(REPORT).success).toBe(true);
});

test("JUnit: a suite per file, a case per test and harness, inconclusive as skipped, XML escaped", () => {
  const xml = toJunit(REPORT, label);
  expect(xml).toContain('<testsuites name="ctxray" tests="4" failures="1" skipped="2" time="4.800">');
  expect(xml).toContain('<testsuite name="tests/a.ctxray.ts" tests="4" failures="1" skipped="2" time="4.600">');
  expect(xml).toContain('name="[L4] payments › context budget › codex" time="1.900">');
  expect(xml).toContain(
    '<failure message="expect(received).toBeLessThan(25000)">expect(received).toBeLessThan(25000)\nReceived: 27104</failure>',
  );
  expect(xml).toContain('name="[L6] payments › refunds &lt;prompt&gt; › claude-code"');
  expect(xml).toContain('<skipped message="inconclusive: skill(refunds) unsettled"/>');
  expect(xml).toContain('<skipped message="unsupported"/>');
});

test("Allure: a result per cell with stable history ids, and the categories", () => {
  const files = toAllure(REPORT, label);
  const results = Object.entries(files)
    .filter(([name]) => name.endsWith("-result.json"))
    .map(
      ([, text]) =>
        JSON.parse(text) as { status: string; historyId: string; labels: { name: string; value: string }[] },
    );
  expect(results.map((one) => one.status)).toEqual(["passed", "failed", "unknown", "skipped"]);
  expect(toAllure(REPORT, label)).not.toEqual(files);
  const again = Object.entries(toAllure(REPORT, label))
    .filter(([name]) => name.endsWith("-result.json"))
    .map(([, text]) => (JSON.parse(text) as { historyId: string }).historyId);
  expect(again).toEqual(results.map((one) => one.historyId));
  expect(results[1]?.labels).toContainEqual({ name: "story", value: "codex" });
  expect(Object.keys(files)).toContain("categories.json");
});

test("Markdown: counts, layers, failures, the starting context, and the diff against the base", () => {
  expect(toMarkdown(REPORT, t, ".ctxray/report/index.html")).toBe(
    [
      "## ctxray 0.1.0 · 1 passed · 1 failed · 1 inconclusive · 1 skipped",
      "",
      "| | ✓ | ✗ | ~ | ○ |",
      "|---|---:|---:|---:|---:|",
      "| L4 | 1 | 1 | 0 | 0 |",
      "| L6 | 0 | 0 | 1 | 1 |",
      "",
      "### Failed",
      "",
      "- **codex › payments › context budget** `L4`",
      "  ✗ expect(received).toBeLessThan(25000)",
      "  ✗ Received: 27104",
      "",
      "### Starting context, tokens",
      "",
      "| | total | system | tools | rules | skills | mcp | commands |",
      "|---|---:|---:|---:|---:|---:|---:|---:|",
      "| claude-code | ≈2000 | 900 | 500 | 120 | 30 | 400 | 0 |",
      "",
      "### Against origin/master",
      "",
      "| | total | Δ | Changes |",
      "|---|---:|---:|---|",
      "| claude-code | 2000 | +200 | +jira/search |",
      "",
      "The whole report: .ctxray/report/index.html",
      "",
    ].join("\n"),
  );
});
