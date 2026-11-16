import { expect, test } from "bun:test";
import { Report } from "#shared/contract/index.ts";
import { createTranslator } from "#shared/i18n/index.ts";
import type { TestRunResult } from "../test-run.action.ts";
import { buildReport } from "./report.ts";
import type { CellResult } from "./run.ts";

const cell = (overrides: Partial<CellResult>): CellResult => ({
  file: "/repo/tests/a.ctxray.ts",
  suites: ["payments"],
  fixture: "/repo/payments",
  name: "rules",
  key: "payments › rules",
  layer: "L3",
  harness: "claude-code",
  status: "passed",
  attempts: 1,
  duration: 12.4,
  ...overrides,
});

const RESULT: TestRunResult = {
  cwd: "/repo",
  root: "/repo",
  files: ["/repo/tests/a.ctxray.ts"],
  broken: [{ file: "/repo/tests/b.ctxray.ts", failure: { kind: "error", message: "boom", where: undefined } }],
  results: [
    cell({}),
    cell({ harness: "codex", status: "skipped", reason: "unsupported", missing: ["pathRules"] }),
    cell({
      name: "refunds",
      key: "payments › refunds",
      layer: "L6",
      status: "inconclusive",
      failure: {
        kind: "check",
        key: "activate.inconclusive",
        params: { subject: "skill(refunds)", rate: "0.80", low: "0.38", high: "0.96" },
        lines: [],
      },
      stats: [
        {
          subject: "skill(refunds)",
          successes: 4,
          samples: 5,
          rate: 0.8,
          low: 0.38,
          high: 0.96,
          threshold: { min: 0.5 },
          verdict: "inconclusive",
          needed: 11,
        },
      ],
    }),
    cell({ name: "hidden", key: "hidden", status: "skipped", reason: "filtered" }),
  ],
  snapshots: { written: 0, updated: 0, missing: 0 } as TestRunResult["snapshots"],
  installed: undefined,
  duration: 1234.5,
  spend: undefined,
  cassettes: 0,
  selection: {
    harnesses: ["claude-code", "codex"],
    experimental: new Set(),
    backend: { kind: "replay", name: "pr" },
    layers: new Set(["L3", "L6"]),
    filter: undefined,
  },
  coverage: [],
  base: undefined,
  baseline: undefined,
};

test("the report fits its schema, groups cells by test, and leaves filtered ones out", () => {
  const report = buildReport(RESULT, {
    version: "0.1.0",
    langs: ["en", "ru"],
    t: createTranslator("en"),
    now: new Date(0),
  });
  expect(Report.safeParse(report).success).toBe(true);
  expect(report.tests.map((one) => [one.id, one.cells.map((c) => c.status)])).toEqual([
    ["tests/a.ctxray.ts#payments › rules", ["passed", "skipped"]],
    ["tests/a.ctxray.ts#payments › refunds", ["inconclusive"]],
  ]);
  expect(report.tests[1]?.cells[0]?.failure?.message).toBe(
    "skill(refunds) loaded at a rate of 0.80 [0.38–0.96, 95% CI]: too few samples to tell",
  );
  expect(report.summary).toMatchObject({ passed: 1, skipped: 1, inconclusive: 1 });
  expect(report.run).toMatchObject({ backend: { kind: "replay", name: "pr" }, layers: ["L3", "L6"], duration: 1235 });
  expect(report.broken).toEqual([
    { file: "tests/b.ctxray.ts", failure: { kind: "error", message: "boom", lines: [] } },
  ]);
});
