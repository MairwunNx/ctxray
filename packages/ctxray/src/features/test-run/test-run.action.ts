import { realpath } from "node:fs/promises";
import { relative, sep } from "node:path";
import { findRoot } from "#entities/harness/index.ts";
import type { Config } from "#entities/user-config/index.ts";
import type { Env } from "#shared/infra/index.ts";
import { type Failure, toFailure } from "./lib/attempt.ts";
import { createCapture } from "./lib/capture.ts";
import { runChecks } from "./lib/checks.ts";
import { collectFile, findTestFiles, installedVersion } from "./lib/collect.ts";
import { runContextChecks } from "./lib/context.ts";
import { type CellResult, runDefinition } from "./lib/run.ts";
import { fullName, type Selection } from "./lib/selection.ts";
import { createSnapshots, type SnapshotStats } from "./lib/snapshot.ts";
import { createWorkspaces } from "./lib/workspace.ts";

export type TestRunRequest = {
  selection: Selection;
  updateSnapshots: boolean;
  differences?: boolean; // warn when the harnesses get different instructions, true by default
  errorOnWarnings?: boolean; // --error-on-warnings, over the config
};

export type TestRunResult = {
  cwd: string; // where ctxray runs: paths in the view are relative to it
  files: readonly string[]; // the test files found, absolute
  broken: readonly { file: string; failure: Failure }[]; // test files that failed to load
  results: readonly CellResult[];
  snapshots: SnapshotStats;
  installed: string | undefined; // @mairwunnx/ctxray in the project's node_modules, when it isn't this version
  duration: number;
};

export type Progress = (done: number, total: number, current: string | undefined) => void;

export const createTestRunAction =
  (config: Config, cwd: string, version: string, env: Env, self: readonly string[]) =>
  async (
    { selection, updateSnapshots, differences = true, errorOnWarnings = false }: TestRunRequest,
    progress: Progress = () => {},
  ): Promise<TestRunResult> => {
    const started = performance.now();
    const here = await realpath(cwd);
    const { root } = await findRoot(here);
    const workspaces = createWorkspaces();
    const repository = await workspaces(root);
    const files = findTestFiles(repository.project, relative(root, here).split(sep).join("/"));
    // One file at a time: their suite() and test() calls land in whichever file is loading.
    const run = crypto.randomUUID();
    const collected = [];
    for (const file of files) collected.push(await collectFile(file, run));
    const definitions = collected.flatMap((file) => file.tests);
    const snapshots = createSnapshots(updateSnapshots);
    const capture = createCapture({ config, env, self });
    const context = { root, workspaces, snapshots, capture };

    const results = await runChecks(repository, selection.harnesses, selection.layers, {
      policies: config.policies,
      lint: errorOnWarnings ? { ...config.lint, errorOnWarnings } : config.lint,
      limits: config.limitsInput,
      differences,
    });
    results.push(...(await runContextChecks(repository, selection, capture, config.policies, env)));
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
      installed: installed === version ? undefined : installed,
      duration: performance.now() - started,
    };
  };
createTestRunAction.inject = ["config", "cwd", "version", "env", "self"] as const;
export type TestRunAction = ReturnType<typeof createTestRunAction>;
