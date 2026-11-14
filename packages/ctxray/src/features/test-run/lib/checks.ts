import {
  checkFiles,
  checkPolicies,
  checkReach,
  type FileCheckSettings,
  type Inventory,
  type Problem,
  type ReachOptions,
  STATIC_ADAPTERS,
} from "#entities/harness/index.ts";
import type { HarnessId, Layer, Policy } from "#shared/contract/index.ts";
import type { CellResult } from "./run.ts";
import type { Workspace } from "./scope.ts";

const checkResult = (harness: HarnessId, layer: Layer, check: "lint" | "policy", name: string) => ({
  file: undefined,
  check,
  suites: [],
  fixture: undefined,
  name,
  key: `${check}:${name}`,
  layer,
  harness,
  attempts: 1,
  duration: 0,
});

// L1 without a single test: the files of every harness parse, link, and name things right. Errors fail it,
// warnings and dead rules show up under it without failing.
const lintOne = async (
  workspace: Workspace,
  harness: HarnessId,
  unread: readonly Problem[],
  settings: FileCheckSettings,
): Promise<CellResult> => {
  const base = checkResult(harness, "L1", "lint", "");
  if (!STATIC_ADAPTERS[harness]) return { ...base, attempts: 0, status: "skipped", reason: "unavailable" };
  const inventory = await workspace.inventoryOf(harness);
  const problems = await checkFiles(workspace.project, inventory, harness, settings, unread);
  if (problems.length === 0) return { ...base, status: "passed" };
  const errors = problems.filter((problem) => problem.severity === "error");
  const failure = { kind: "problems" as const, problems: [...errors, ...problems.filter((p) => !errors.includes(p))] };
  const warnings = problems.length - errors.length;
  return { ...base, status: errors.length > 0 ? "failed" : "passed", failure, warnings };
};

// L2: each policy of the config, on the harnesses it names. A `warning` policy reports without failing.
const policiesOf = async (workspace: Workspace, harness: HarnessId, policies: readonly Policy[]) => {
  const adapter = STATIC_ADAPTERS[harness];
  const covered = policies.filter((policy) => !policy.harnesses || policy.harnesses.includes(harness));
  if (!adapter) {
    return covered.map(
      (policy): CellResult => ({
        ...checkResult(harness, "L2", "policy", policy.id),
        attempts: 0,
        status: "skipped",
        reason: "unavailable",
      }),
    );
  }
  const inventory = await workspace.inventoryOf(harness);
  const loadout = adapter.resolve(inventory, { cwd: "", files: [] });
  const outcomes = await checkPolicies(covered, workspace.project, loadout);
  // A policy with only limits that need a run, like `total`, belongs to the L4 starting context check.
  const here = outcomes.filter((outcome) => outcome.status !== "skipped" || outcome.skipped.length === 0);
  return here.map((outcome): CellResult => {
    const base = checkResult(harness, "L2", "policy", outcome.id);
    const failure = { kind: "findings" as const, findings: outcome.failures };
    if (outcome.status === "skipped") return { ...base, status: "skipped", reason: "unavailable" };
    if (outcome.status === "passed") return { ...base, status: "passed" };
    // Passed, but the view still lists what it found.
    if (outcome.severity === "warning")
      return { ...base, status: "passed", failure, warnings: outcome.failures.length };
    return { ...base, status: "failed", failure };
  });
};

// What the config says about L1 and L2: the policies, the size limits, and whether harness differences count.
export type CheckSettings = { policies: readonly Policy[] } & FileCheckSettings & ReachOptions;

export const runChecks = async (
  workspace: Workspace,
  harnesses: readonly HarnessId[],
  layers: ReadonlySet<Layer>,
  { policies, lint, limits, differences }: CheckSettings,
): Promise<CellResult[]> => {
  // What none of the run's harnesses reads is checked across them, then reported under each that misses it.
  const readable = harnesses.filter((harness) => STATIC_ADAPTERS[harness]);
  const inventories: Partial<Record<HarnessId, Inventory>> = Object.fromEntries(
    await Promise.all(readable.map(async (harness) => [harness, await workspace.inventoryOf(harness)])),
  );
  const unread = await checkReach(workspace.project, inventories, { differences });
  const lints = layers.has("L1")
    ? await Promise.all(
        harnesses.map((harness) => lintOne(workspace, harness, unread[harness] ?? [], { lint, limits })),
      )
    : [];
  const checked = layers.has("L2")
    ? await Promise.all(harnesses.map((harness) => policiesOf(workspace, harness, policies)))
    : [];
  return [...lints, ...checked.flat()];
};
