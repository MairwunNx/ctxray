import type { HarnessId, Layer, SkipReason, TestStatus } from "#shared/contract/index.ts";
import { attempt, DEFAULT_TIMEOUT, type Failure, toFailure } from "./attempt.ts";
import type { Capture } from "./capture.ts";
import { formatName } from "./dsl.ts";
import { resolveIn } from "./loadout.ts";
import { KIND_LAYERS, type TestDefinition } from "./model.ts";
import { selectRules } from "./rules.ts";
import { type CellScope, inCell } from "./scope.ts";
import { decide, type Selection } from "./selection.ts";
import { createSession, type Session, type SessionRequest } from "./session.ts";
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
  tokens?: number; // the starting context of a context check, counted locally
  attempts: number;
  duration: number;
};

export type RunContext = { root: string; workspaces: Workspaces; snapshots: Snapshots; capture: Capture };

// A harness needs a few seconds to start, and a test may run several sessions.
const CAPTURE_TIMEOUT = 120_000;

// What a test body gets: its item, and the tools of its layer. Every session it opened ends with it, and a
// session that fails to end (the harness crashed, or reached for the internet) fails the test.
const runBody = async (definition: TestDefinition, item: Cell["item"], scope: CellScope, capture: Capture) => {
  const sessions: Session[] = [];
  const startSession = (request: SessionRequest = {}) => {
    const session = createSession(capture, scope, {
      ...(definition.options.cwd && { cwd: definition.options.cwd }),
      ...request,
    });
    sessions.push(session);
    return session;
  };
  const assemble = async (request: SessionRequest = {}) => (await startSession(request).firstRequest()).loadout;
  const context = { ...item, harness: scope.harness, resolve: resolveIn(scope), assemble, startSession };
  let error: unknown;
  try {
    await inCell(scope, () =>
      definition.body(definition.kind === "wire" ? { ...context, session: startSession() } : context),
    );
  } catch (thrown) {
    error = thrown;
  }
  for (const session of sessions) {
    try {
      await session.end();
    } catch (thrown) {
      error ??= thrown;
    }
  }
  if (error !== undefined) throw error;
};

type Cell = { name: string; key: string; item: Readonly<Record<string, unknown>> | undefined };

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
    name: definition.name,
    key: definition.key,
    layer: KIND_LAYERS[definition.kind],
    harness,
    attempts: 0,
    duration: 0,
  };
  const decision = decide(definition, harness, selection);
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
    const timeout = definition.options.timeout ?? (base.layer === "L3" ? DEFAULT_TIMEOUT : CAPTURE_TIMEOUT);
    const { value, duration } = await timed(() =>
      attempt(() => runBody(definition, cell.item, scope, context.capture), { ...definition.options, timeout }),
    );
    results.push({ ...base, name: cell.name, key: cell.key, ...value, duration });
  }
  return results;
};
