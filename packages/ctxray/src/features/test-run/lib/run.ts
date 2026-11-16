import type { HarnessId, Layer, SkipReason, TestStatus } from "#shared/contract/index.ts";
import { attempt, DEFAULT_TIMEOUT, type Failure, toFailure } from "./attempt.ts";
import { runBody } from "./body.ts";
import type { Capture } from "./capture.ts";
import { formatName } from "./dsl.ts";
import type { EvalContext } from "./evals.ts";
import { KIND_LAYERS, type TestDefinition } from "./model.ts";
import { selectRules } from "./rules.ts";
import type { CellScope, SessionRecord, Stat } from "./scope.ts";
import { decide, type Selection } from "./selection.ts";
import { type Snapshots, snapshotKey } from "./snapshot.ts";
import type { Workspaces } from "./workspace.ts";

// One cell of the matrix: a test on a harness.
export type CellResult = {
  file: string | undefined; // the test file; undefined for ctxray's own L1 and L2 checks
  check?: "lint" | "policy" | "context";
  suites: readonly string[];
  fixture: string | undefined;
  name: string;
  key: string;
  layer: Layer;
  harness: HarnessId;
  status: TestStatus;
  reason?: SkipReason;
  missing?: readonly string[];
  failure?: Failure;
  warnings?: number;
  tokens?: number; // the starting context of a context check
  exact?: boolean; // the provider counted `tokens`, not a local tokenizer
  stats?: readonly Stat[]; // the rates L6 and L7 judged
  sessions?: readonly SessionRecord[]; // the harness sessions it ran, for the report
  attempts: number;
  duration: number;
};

export type RunContext = {
  root: string;
  workspaces: Workspaces;
  snapshots: Snapshots;
  capture: Capture;
  evals: EvalContext | undefined; // set with a replay or real backend
  seen: (harness: HarnessId) => Set<string>; // what the tests of each harness looked at, for coverage
};

// A harness needs a few seconds to start, and a test may run several sessions.
const CAPTURE_TIMEOUT = 120_000;

const isEval = (layer: Layer) => layer === "L6" || layer === "L7";

export type Cell = { name: string; key: string; item: Readonly<Record<string, unknown>> | undefined };

const cellsOf = (definition: TestDefinition, scope: CellScope): Cell[] => {
  if (!definition.rules) return [{ name: definition.name, key: definition.key, item: definition.item }];
  // A test per rule, named by its path, so history and snapshots stay put when rules come and go.
  return selectRules(scope, definition.rules).map((rule) => ({
    name: formatName(definition.name, { rule }),
    key: `${definition.key} › ${rule.path}`,
    item: { rule },
  }));
};

const timed = async <T>(run: () => Promise<T>) => {
  const started = performance.now();
  const value = await run();
  return { value, duration: performance.now() - started };
};

// A test per rule that doesn't run expands to no rules: its placeholders show as “…”, not as `{rule.path}`.
const unexpanded = (definition: TestDefinition) =>
  definition.rules ? definition.name.replace(/\{rule(\.[^}]*)?\}/g, "…") : definition.name;

export const runDefinition = async (
  definition: TestDefinition,
  harness: HarnessId,
  selection: Selection,
  context: RunContext,
): Promise<CellResult[]> => {
  const base = {
    file: definition.file,
    suites: definition.suites,
    fixture: definition.fixture,
    name: unexpanded(definition),
    key: definition.key,
    layer: KIND_LAYERS[definition.kind],
    harness,
    attempts: 0,
    duration: 0,
  };
  const decision = decide(definition, harness, selection);
  if (decision.run && isEval(base.layer) && context.evals?.backend.spent()) {
    return [{ ...base, status: "skipped", reason: "budget" }];
  }
  if (!decision.run) {
    return [
      { ...base, status: "skipped", reason: decision.reason, ...(decision.missing && { missing: decision.missing }) },
    ];
  }
  const prepare = async () => {
    const workspace = await context.workspaces(definition.fixture ?? context.root);
    const inventory = await workspace.inventoryOf(harness);
    await context.snapshots.load(definition.file);
    const scopeOf = (key: string): CellScope => ({
      harness,
      workspace,
      inventory,
      snapshot: (value, variant) => context.snapshots.check(definition.file, snapshotKey(key, harness, variant), value),
      stats: [],
      sessions: [],
      seen: context.seen(harness),
      ...(context.evals && { activate: context.evals.activate }),
    });
    return { scopeOf, cells: cellsOf(definition, scopeOf(definition.key)) };
  };
  let prepared: Awaited<ReturnType<typeof prepare>>;
  try {
    prepared = await prepare();
  } catch (error) {
    return [{ ...base, status: "failed", failure: toFailure(error) }];
  }
  const results: CellResult[] = [];
  for (const cell of prepared.cells) {
    const scope = prepared.scopeOf(cell.key);
    // An eval's samples time out one by one, so the test as a whole doesn't.
    const timeout = isEval(base.layer)
      ? Number.POSITIVE_INFINITY
      : (definition.options.timeout ?? (base.layer === "L3" ? DEFAULT_TIMEOUT : CAPTURE_TIMEOUT));
    const { value, duration } = await timed(() =>
      attempt(
        () => {
          scope.stats.length = 0;
          scope.sessions.length = 0;
          return runBody(definition, cell, scope, context);
        },
        { ...definition.options, timeout },
      ),
    );
    const stats = scope.stats.length > 0 ? { stats: [...scope.stats] } : {};
    const sessions = scope.sessions.length > 0 ? { sessions: [...scope.sessions] } : {};
    results.push({ ...base, name: cell.name, key: cell.key, ...value, ...stats, ...sessions, duration });
  }
  return results;
};
