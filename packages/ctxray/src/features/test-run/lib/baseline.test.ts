import { afterAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Problem } from "#entities/harness/index.ts";
import { applyBaseline, loadBaseline, writeBaseline } from "./baseline.ts";
import type { CellResult } from "./run.ts";

const dirs: string[] = [];
afterAll(async () => {
  for (const dir of dirs) await rm(dir, { recursive: true, force: true });
});

const problem = (key: Problem["key"], path: string, severity: Problem["severity"], line = 1): Problem => ({
  key,
  path,
  severity,
  line,
  params: { path },
});

const lint = (problems: Problem[]): CellResult => ({
  file: undefined,
  check: "lint",
  suites: [],
  fixture: undefined,
  name: "",
  key: "lint:",
  layer: "L1",
  harness: "claude-code",
  status: problems.some((one) => one.severity === "error") ? "failed" : "passed",
  failure: { kind: "problems", problems },
  attempts: 1,
  duration: 0,
});

test("known findings stop failing, a new one still fails, and a moved line is still known", async () => {
  const root = await mkdtemp(join(tmpdir(), "ctxray-baseline-"));
  dirs.push(root);
  const old = [problem("lint.brokenLink", "CLAUDE.md", "error"), problem("lint.empty", "a.md", "warning")];
  expect(await writeBaseline(root, [lint(old)])).toBe(2);
  const known = (await loadBaseline(root)) ?? new Set<string>();

  const same = [lint([problem("lint.brokenLink", "CLAUDE.md", "error", 9), problem("lint.empty", "a.md", "warning")])];
  expect(applyBaseline(same, known)).toBe(2);
  expect([same[0]?.status, same[0]?.failure, same[0]?.warnings]).toEqual(["passed", undefined, undefined]);

  const fresh = [lint([...old, problem("lint.brokenLink", "app/CLAUDE.md", "error")])];
  expect(applyBaseline(fresh, known)).toBe(2);
  expect(fresh[0]?.status).toBe("failed");
  expect(fresh[0]?.failure?.kind === "problems" && fresh[0].failure.problems.map((one) => one.path)).toEqual([
    "app/CLAUDE.md",
  ]);
});

test("no file, no baseline", async () => {
  const root = await mkdtemp(join(tmpdir(), "ctxray-baseline-"));
  dirs.push(root);
  expect(await loadBaseline(root)).toBeUndefined();
});
