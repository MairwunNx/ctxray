import { expect, test } from "bun:test";
import { settleMissing } from "./installed.ts";
import type { CellResult } from "./run.ts";

const cell = (fields: Partial<CellResult>): CellResult =>
  ({
    file: "t.ctxray.ts",
    check: undefined,
    suites: [],
    fixture: undefined,
    name: "n",
    key: "n",
    layer: "L4",
    harness: "codex",
    status: "passed",
    attempts: 1,
    duration: 0,
    ...fields,
  }) as CellResult;
const notInstalled = cell({
  status: "failed",
  failure: { kind: "check", key: "capture.notInstalled", params: { harness: "codex", binary: "codex" }, lines: [] },
});
const context = cell({
  file: undefined,
  check: "context",
  status: "skipped",
  reason: "unavailable",
  missing: ["codex"],
  attempts: 0,
});

// A run that names its layers wants them: a harness they need fails. One that names none takes what it can.
test.each<[string, boolean, CellResult, string]>([
  ["a test, layers named", true, notInstalled, "failed"],
  ["a test, no layers named", false, notInstalled, "skipped"],
  ["the L4 check, layers named", true, context, "failed"],
  ["the L4 check, no layers named", false, context, "skipped"],
  ["anything else stays", false, cell({ status: "failed" }), "failed"],
])("%s", (_, chosen, given, status) => {
  const [settled] = settleMissing([given], { chosen });
  expect(settled?.status).toBe(status as CellResult["status"]);
});
