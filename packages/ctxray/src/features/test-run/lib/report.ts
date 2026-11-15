import { basename, relative } from "node:path";
import { PROFILES, ruleOf } from "#entities/harness/index.ts";
import {
  type Layer,
  REPORT_SCHEMA_VERSION,
  type Report,
  type ReportFailure,
  type ReportTest,
  type TestStatus,
} from "#shared/contract/index.ts";
import type { Translate } from "#shared/i18n/index.ts";
import type { TestRunResult } from "../test-run.action.ts";
import type { Failure } from "./attempt.ts";
import type { CellResult } from "./run.ts";

export type ReportOptions = { version: string; langs: readonly string[]; t: Translate; now: Date };

// The failure in machine-readable form, its message in the report's first language.
export const reportFailure = (failure: Failure, t: Translate): ReportFailure => {
  switch (failure.kind) {
    case "check":
      return {
        kind: "check",
        key: failure.key,
        params: { ...failure.params },
        message: t(failure.key, failure.params),
        lines: [...failure.lines],
      };
    case "error":
      return { kind: "error", message: failure.message, lines: [], ...(failure.where && { where: failure.where }) };
    case "problems":
      return {
        kind: "problems",
        message: "",
        lines: [],
        problems: failure.problems.map((problem) => ({
          severity: problem.severity,
          key: problem.key,
          ...(ruleOf(problem.key) && { rule: ruleOf(problem.key) }),
          path: problem.path,
          ...(problem.line !== undefined && { line: problem.line }),
          params: { ...problem.params },
          message: t(problem.key, problem.params),
        })),
      };
    case "findings":
      return {
        kind: "findings",
        message: "",
        lines: [],
        problems: failure.findings.map((finding) => ({
          severity: "error" as const,
          key: finding.key,
          params: { ...finding.params },
          message: t(finding.key, finding.params),
        })),
      };
  }
};

const STATUSES: TestStatus[] = ["passed", "failed", "skipped", "inconclusive", "flaky"];
const countsOf = (cells: readonly CellResult[]) =>
  Object.fromEntries(
    STATUSES.map((status) => [status, cells.filter((cell) => cell.status === status).length]),
  ) as Record<TestStatus, number>;

const testsOf = (results: readonly CellResult[], root: string, t: Translate): ReportTest[] => {
  const tests = new Map<string, ReportTest>();
  for (const cell of results.filter((one) => one.reason !== "filtered")) {
    const file = cell.file === undefined ? undefined : relative(root, cell.file);
    const id = `${file ?? `ctxray:${cell.check}`}#${cell.key}`;
    const test = tests.get(id) ?? {
      id,
      ...(file !== undefined && { file }),
      ...(cell.check && { check: cell.check }),
      suites: [...cell.suites],
      name: cell.name,
      layer: cell.layer,
      ...(cell.fixture && { fixture: relative(root, cell.fixture) || "." }),
      cells: [],
    };
    test.cells.push({
      harness: cell.harness,
      status: cell.status,
      ...(cell.reason && { reason: cell.reason }),
      ...(cell.missing && { missing: [...cell.missing] }),
      attempts: cell.attempts,
      duration: Math.round(cell.duration),
      ...(cell.tokens !== undefined && { tokens: cell.tokens, exact: cell.exact === true }),
      ...(cell.warnings && { warnings: cell.warnings }),
      ...(cell.failure && { failure: reportFailure(cell.failure, t) }),
      ...(cell.stats && { stats: cell.stats.map((stat) => ({ ...stat })) }),
      ...(cell.sessions && {
        sessions: cell.sessions.map((one) => ({
          ...one,
          timeline: one.timeline.map((turn) => ({ ...turn, added: [...turn.added] })),
        })),
      }),
    });
    tests.set(id, test);
  }
  return [...tests.values()];
};

// The run as the versioned JSON every other report renders (TASK §9).
export const buildReport = (result: TestRunResult, { version, langs, t, now }: ReportOptions): Report => {
  const kept = result.results.filter((cell) => cell.reason !== "filtered");
  const layers = [...new Set(kept.map((cell) => cell.layer))].sort() as Layer[];
  const byLayer = Object.fromEntries(
    layers.map((layer) => [layer, countsOf(kept.filter((cell) => cell.layer === layer))]),
  );
  const { spend } = result;
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    ctxray: version,
    createdAt: now.toISOString(),
    langs: [...langs],
    project: { name: basename(result.root), root: relative(result.cwd, result.root) || "." },
    run: {
      backend: {
        kind: result.selection.backend.kind,
        ...(result.selection.backend.name && { name: result.selection.backend.name }),
      },
      layers: [...result.selection.layers].sort(),
      ...(result.selection.filter && { filter: result.selection.filter }),
      duration: Math.round(result.duration),
      ...(spend && {
        spend: {
          usd: spend.cost,
          tokens: spend.usage.input + spend.usage.cacheRead + spend.usage.cacheWrite + spend.usage.output,
          unpriced: [...spend.unpriced],
        },
      }),
    },
    summary: { ...countsOf(kept), byLayer },
    harnesses: result.selection.harnesses.map((id) => {
      const start = kept.find((cell) => cell.check === "context" && cell.harness === id)?.sessions?.[0]?.start;
      return { id, title: PROFILES[id].title, modes: [...PROFILES[id].modes], ...(start && { start }) };
    }),
    tests: testsOf(result.results, result.root, t),
    broken: result.broken.map(({ file, failure }) => ({
      file: relative(result.root, file),
      failure: reportFailure(failure, t),
    })),
    coverage: result.coverage.map((one) => ({ ...one, kinds: one.kinds.map((kind) => ({ ...kind })) })),
    ...(result.base && {
      base: {
        ref: result.base.ref,
        diffs: result.base.diffs.map(({ harness, diff }) => ({
          harness,
          total: diff.total,
          byComponent: diff.byComponent,
          changes: diff.changes.map((change) => ({
            component: change.component,
            id: change.id,
            ...(change.before !== undefined && { before: change.before }),
            ...(change.after !== undefined && { after: change.after }),
          })),
        })),
      },
    }),
    ...(result.baseline && { baseline: result.baseline }),
  };
};
