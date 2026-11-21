import { z } from "zod";
import { Backend } from "./config.ts";
import { CaptureMode, HarnessId } from "./harness.ts";
import { Component, LoadoutSnapshot } from "./loadout.ts";
import { Layer, SkipReason, TestStatus } from "./result.ts";

export const REPORT_SCHEMA_VERSION = 1;

// Machine-readable parts carry stable keys and codes. `message` is in the report's first language.
export const ReportProblem = z.object({
  severity: z.enum(["error", "warning"]),
  key: z.string(),
  rule: z.string().optional().describe("The L1 check, as `lint.rules` names it"),
  path: z.string().optional(),
  line: z.number().int().positive().optional(),
  params: z.record(z.string(), z.unknown()),
  message: z.string(),
});

export const ReportFailure = z.object({
  kind: z.enum(["check", "error", "problems", "findings"]),
  key: z.string().optional().describe("Message key of a check ctxray worded, like `expect.failed`"),
  params: z.record(z.string(), z.unknown()).optional(),
  message: z.string(),
  lines: z.array(z.object({ label: z.string(), value: z.string() })).describe("Labels are message keys"),
  where: z.string().optional().describe("file:line:column of the user's code"),
  problems: z.array(ReportProblem).optional(),
});
export type ReportFailure = z.infer<typeof ReportFailure>;

export const ReportStat = z.object({
  subject: z.string().describe("Like `skill(refunds)` or `not skill(payouts)`"),
  successes: z.number().int().nonnegative(),
  samples: z.number().int().nonnegative(),
  rate: z.number(),
  low: z.number().describe("Wilson 95% interval"),
  high: z.number(),
  threshold: z.union([z.object({ min: z.number() }), z.object({ max: z.number() })]),
  verdict: z.enum(["passed", "failed", "inconclusive"]),
  needed: z.number().int().optional().describe("Inconclusive: samples in all that would settle it"),
});

export const ReportSession = z.object({
  start: LoadoutSnapshot.describe("The first request: the starting context"),
  peak: LoadoutSnapshot.describe("The largest request of the session"),
  timeline: z.array(
    z.object({ turn: z.number().int().nonnegative(), added: z.array(z.string()), tokens: z.number().int() }),
  ),
});

export const ReportCell = z.object({
  harness: HarnessId,
  status: TestStatus,
  reason: SkipReason.optional(),
  missing: z.array(z.string()).optional(),
  attempts: z.number().int().nonnegative(),
  duration: z.number().nonnegative().describe("Milliseconds"),
  tokens: z.number().int().optional().describe("The starting context of the context check"),
  exact: z.boolean().optional(),
  warnings: z.number().int().optional(),
  failure: ReportFailure.optional(),
  stats: z.array(ReportStat).optional(),
  sessions: z.array(ReportSession).optional(),
});
export type ReportCell = z.infer<typeof ReportCell>;

export const ReportTest = z.object({
  id: z.string().describe("Stable across runs: the file and the test's key"),
  file: z.string().optional().describe("Relative to the project root. None for ctxray's own checks"),
  check: z.enum(["lint", "policy", "context"]).optional(),
  suites: z.array(z.string()),
  name: z.string(),
  layer: Layer,
  fixture: z.string().optional(),
  cells: z.array(ReportCell),
});
export type ReportTest = z.infer<typeof ReportTest>;

const Pieces = z.array(z.object({ id: z.string(), tokens: z.number() }));

export const ReportLoadout = z.object({
  total: z.number(),
  byComponent: z.partialRecord(Component, z.number()),
  items: z.object({ system: Pieces, tools: Pieces, rules: Pieces, skills: Pieces, mcp: Pieces, commands: Pieces }),
});

export const ReportHarness = z.object({
  id: HarnessId,
  title: z.string(),
  modes: z.array(CaptureMode).describe("static is T1, capture T2, observe T3"),
  start: LoadoutSnapshot.optional().describe("The starting context the context check captured"),
  loadout: ReportLoadout.optional().describe(
    "What L3 predicts at the project root: `ctxray diff --file` compares with it",
  ),
});

export const ReportCoverage = z.object({
  harness: HarnessId,
  kinds: z.array(z.object({ activation: z.string(), total: z.number().int(), tested: z.number().int() })),
  untested: z.array(z.string()).describe("Rules and skills no test of the run saw load"),
  dead: z.array(z.string()).describe("Rules whose globs match no file"),
  noPrompts: z.array(z.string()).describe("Rules and skills picked by description that no L6 or L7 run loaded"),
});

export const ReportDiff = z.object({
  harness: HarnessId,
  total: z.object({ before: z.number(), after: z.number() }),
  byComponent: z.partialRecord(Component, z.object({ before: z.number(), after: z.number() })),
  changes: z.array(
    z.object({ component: Component, id: z.string(), before: z.number().optional(), after: z.number().optional() }),
  ),
});

const counts = z.object({
  passed: z.number().int(),
  failed: z.number().int(),
  skipped: z.number().int(),
  inconclusive: z.number().int(),
  flaky: z.number().int(),
});

export const Report = z.object({
  schemaVersion: z.literal(REPORT_SCHEMA_VERSION),
  ctxray: z.string(),
  createdAt: z.string().describe("ISO 8601"),
  langs: z.array(z.string()).describe("Languages the HTML report carries, the first by default"),
  project: z.object({ name: z.string(), root: z.string() }),
  run: z.object({
    backend: z.object({ kind: Backend, name: z.string().optional() }),
    layers: z.array(Layer),
    filter: z.string().optional(),
    duration: z.number(),
    spend: z
      .object({ usd: z.number(), tokens: z.number().int(), unpriced: z.array(z.string()) })
      .optional()
      .describe("A real run: what the model cost, at list prices"),
  }),
  summary: counts.extend({ byLayer: z.partialRecord(Layer, counts) }),
  harnesses: z.array(ReportHarness),
  tests: z.array(ReportTest),
  broken: z.array(z.object({ file: z.string(), failure: ReportFailure })).describe("Test files that failed to load"),
  coverage: z.array(ReportCoverage),
  base: z
    .object({ ref: z.string(), diffs: z.array(ReportDiff) })
    .optional()
    .describe("--base: the loadout against another revision"),
  baseline: z
    .object({ file: z.string(), known: z.number().int() })
    .optional()
    .describe("Findings the baseline file already holds: they don't fail the run"),
});
export type Report = z.infer<typeof Report>;
