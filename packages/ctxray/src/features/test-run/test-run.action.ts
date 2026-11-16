import { realpath } from "node:fs/promises";
import { relative, sep } from "node:path";
import { findRoot } from "#entities/harness/index.ts";
import type { Progress as CacheProgress } from "#entities/harness-cache/index.ts";
import { type Config, egressOf, resolveNetwork } from "#entities/user-config/index.ts";
import type { HarnessId } from "#shared/contract/index.ts";
import { type Env, isCi } from "#shared/infra/index.ts";
import { createRedactor } from "#shared/redact/index.ts";
import { type Failure, toFailure } from "./lib/attempt.ts";
import { createBackend } from "./lib/backend.ts";
import { type BaseDiff, diffAgainst } from "./lib/base.ts";
import { applyBaseline, BASELINE_FILE, loadBaseline } from "./lib/baseline.ts";
import { createBinaries } from "./lib/binaries.ts";
import { createCapture } from "./lib/capture.ts";
import { createCassettes } from "./lib/cassettes.ts";
import { runChecks } from "./lib/checks.ts";
import { collectFile, findTestFiles, installedVersion } from "./lib/collect.ts";
import { runContextChecks } from "./lib/context.ts";
import { type Coverage, coverageOf } from "./lib/coverage.ts";
import { type CellResult, runDefinition } from "./lib/run.ts";
import { fullName, type Selection } from "./lib/selection.ts";
import { createSnapshots, type SnapshotStats } from "./lib/snapshot.ts";
import { createSpend, type SpendTotal } from "./lib/spend.ts";
import { createWorkspaces } from "./lib/workspace.ts";

export type TestRunRequest = {
  selection: Selection;
  updateSnapshots: boolean;
  differences?: boolean; // warn when the harnesses get different instructions, true by default
  errorOnWarnings?: boolean; // --error-on-warnings, over the config
  frozen?: boolean; // --frozen, on by itself in CI: ctxray.lock must match the config
  install?: boolean; // false with --no-install: a harness missing from the cache fails instead
  record?: boolean; // --record: a real run keeps the model's answers as cassettes for replay
  budget?: number; // --budget: US dollars a real run may spend, over the config
  base?: string | undefined; // --base: the report holds the loadout diff against this revision
};

export type TestRunResult = {
  cwd: string; // where ctxray runs: paths in the view are relative to it
  files: readonly string[]; // the test files found, absolute
  broken: readonly { file: string; failure: Failure }[]; // test files that failed to load
  results: readonly CellResult[];
  snapshots: SnapshotStats;
  spend: SpendTotal | undefined; // a real run: what the model cost
  cassettes: number; // tapes written by --record
  root: string; // the project root
  selection: Selection;
  coverage: readonly Coverage[];
  base: BaseDiff | undefined;
  baseline: { file: string; known: number } | undefined; // findings the baseline file already holds
  installed: string | undefined; // @mairwunnx/ctxray in the project's node_modules, when it isn't this version
  duration: number;
};

export type Progress = (done: number, total: number, current: string | undefined) => void;
export type InstallProgress = (harness: HarnessId, progress: CacheProgress) => void;

export const createTestRunAction =
  (config: Config, cwd: string, version: string, env: Env, self: readonly string[]) =>
  async (
    { selection, updateSnapshots, differences = true, errorOnWarnings = false, ...request }: TestRunRequest,
    progress: Progress = () => {},
    onInstall: InstallProgress = () => {},
  ): Promise<TestRunResult> => {
    const started = performance.now();
    const here = await realpath(cwd);
    const { root } = await findRoot(here);
    // A base git doesn't know fails before any test runs.
    const base = request.base === undefined ? undefined : await diffAgainst(root, request.base, selection.harnesses);
    const workspaces = createWorkspaces();
    const repository = await workspaces(root);
    const files = findTestFiles(repository.project, relative(root, here).split(sep).join("/"));
    // One file at a time: their suite() and test() calls land in whichever file is loading.
    const run = crypto.randomUUID();
    const collected = [];
    for (const file of files) collected.push(await collectFile(file, run));
    const definitions = collected.flatMap((file) => file.tests);
    const snapshots = createSnapshots(updateSnapshots);
    const binaries = createBinaries(config, env, cwd, {
      frozen: request.frozen === true || isCi(env),
      install: request.install !== false,
      onInstall,
    });
    const capture = createCapture({ config, env, self, binaries });
    const spend = createSpend(
      request.budget === undefined ? config.budget : { ...config.budget, usd: request.budget },
      config.prices,
    );
    const cassettes = createCassettes();
    const { kind } = selection.backend;
    const evals =
      kind === "mock"
        ? undefined
        : {
            capture,
            concurrency: 4,
            activate: config.activate,
            backend: createBackend({
              kind,
              record: kind === "real" && request.record === true,
              upstream: config.upstream,
              env,
              egress: () => egressOf(resolveNetwork(config, env)),
              cassettes,
              spend,
              clean: createRedactor(config.redact.patterns).text,
            }),
          };
    const seen = new Map<HarnessId, Set<string>>();
    const seenBy = (harness: HarnessId) => seen.get(harness) ?? seen.set(harness, new Set()).get(harness) ?? new Set();
    const context = { root, workspaces, snapshots, capture, evals, seen: seenBy };

    const results = await runChecks(repository, selection.harnesses, selection.layers, {
      policies: config.policies,
      lint: errorOnWarnings ? { ...config.lint, errorOnWarnings } : config.lint,
      limits: config.limitsInput,
      differences,
    });
    const known = await loadBaseline(root);
    const baselined = known ? applyBaseline(results, known) : 0;
    results.push(...(await runContextChecks(repository, selection, capture, config.policies, binaries)));
    const total = definitions.length * selection.harnesses.length;
    let done = 0;
    for (const definition of definitions) {
      for (const harness of selection.harnesses) {
        progress(done++, total, `${harness} › ${fullName(definition)}`);
        results.push(...(await runDefinition(definition, harness, selection, context)));
      }
    }
    progress(total, total, undefined);
    // Traces stay on disk when a harness test failed: its failure points at them.
    await capture.stop(results.some((result) => result.status === "failed" && result.layer !== "L3" && result.file));
    const installed = await installedVersion(here);
    return {
      cwd: here,
      files,
      broken: collected.flatMap(({ file, error }) =>
        error === undefined ? [] : [{ file, failure: toFailure(error) }],
      ),
      results,
      snapshots: await snapshots.save(),
      spend: kind === "real" ? spend.total() : undefined,
      cassettes: await cassettes.save(),
      root,
      selection,
      coverage: await coverageOf(repository, selection.harnesses, seenBy, results),
      base,
      baseline: known ? { file: BASELINE_FILE, known: baselined } : undefined,
      installed: installed === version ? undefined : installed,
      duration: performance.now() - started,
    };
  };
createTestRunAction.inject = ["config", "cwd", "version", "env", "self"] as const;
export type TestRunAction = ReturnType<typeof createTestRunAction>;
