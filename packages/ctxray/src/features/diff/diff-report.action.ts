import { mkdir } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { findRoot, PROFILES } from "#entities/harness/index.ts";
import { toReportDiff } from "#entities/loadout/index.ts";
import { toHtml } from "#entities/report/index.ts";
import { REPORT_SCHEMA_VERSION, type Report } from "#shared/contract/index.ts";
import type { DiffResult } from "./diff.action.ts";

export type DiffFiles = { json: string; html: string };

// Relative under where ctxray runs, absolute elsewhere: `--report-dir /tmp/out` reads better than ../../tmp/out.
const shown = (cwd: string, path: string) => {
  const near = relative(cwd, path);
  return near.startsWith("..") || isAbsolute(near) ? path : near;
};

const ZERO = { passed: 0, failed: 0, skipped: 0, inconclusive: 0, flaky: 0 };

// A report with no tests and only the diff: the HTML report then opens on its diff tab alone.
const diffReport = (result: DiffResult, ref: string, root: string, version: string, langs: readonly string[]) =>
  ({
    schemaVersion: REPORT_SCHEMA_VERSION,
    ctxray: version,
    createdAt: new Date().toISOString(),
    langs: [...langs],
    project: { name: basename(root), root: "." },
    run: { backend: { kind: "mock" }, layers: ["L3"], duration: 0 },
    summary: { ...ZERO, byLayer: {} },
    harnesses: result.diffs.map(({ harness }) => ({
      id: harness,
      title: PROFILES[harness].title,
      modes: [...PROFILES[harness].modes],
    })),
    tests: [],
    broken: [],
    coverage: [],
    base: { ref, diffs: result.diffs.map(({ harness, diff }) => toReportDiff(harness, diff)) },
  }) satisfies Report;

// diff.json for machines and diff.html for people, in the report folder beside a test run's report.
export const createDiffReportAction =
  (cwd: string, version: string) =>
  async (result: DiffResult, ref: string, dir: string, langs: readonly string[]): Promise<DiffFiles> => {
    const { root } = await findRoot(cwd);
    const folder = resolve(root, dir);
    await mkdir(folder, { recursive: true });
    const json = join(folder, "diff.json");
    const html = join(folder, "diff.html");
    await Bun.write(json, `${JSON.stringify(result, null, 2)}\n`);
    await Bun.write(html, await toHtml(diffReport(result, ref, root, version, langs)));
    return { json: shown(cwd, json), html: shown(cwd, html) };
  };
createDiffReportAction.inject = ["cwd", "version"] as const;
export type DiffReportAction = ReturnType<typeof createDiffReportAction>;
