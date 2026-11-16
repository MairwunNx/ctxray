import { realpath } from "node:fs/promises";
import { join, relative } from "node:path";
import { findRoot } from "#entities/harness/index.ts";
import type { Config } from "#entities/user-config/index.ts";
import type { HarnessId } from "#shared/contract/index.ts";
import { BASELINE_FILE, writeBaseline } from "./lib/baseline.ts";
import { runChecks } from "./lib/checks.ts";
import { createWorkspaces } from "./lib/workspace.ts";

export type BaselineResult = { file: string; count: number };

// `ctxray baseline`: L1 and L2 as they stand, into ctxray.baseline.json at the project root. From then on a run
// fails only on findings the file doesn't hold.
export const createBaselineAction =
  (config: Config, cwd: string) =>
  async (harnesses: readonly HarnessId[]): Promise<BaselineResult> => {
    const here = await realpath(cwd);
    const { root } = await findRoot(here);
    const repository = await createWorkspaces()(root);
    const results = await runChecks(repository, harnesses, new Set(["L1", "L2"]), {
      policies: config.policies,
      lint: config.lint,
      limits: config.limitsInput,
      redact: config.redact.patterns,
      differences: !config.ignoreHarnessDifferences,
    });
    const count = await writeBaseline(root, results);
    return { file: relative(here, join(root, BASELINE_FILE)) || BASELINE_FILE, count };
  };
createBaselineAction.inject = ["config", "cwd"] as const;
export type BaselineAction = ReturnType<typeof createBaselineAction>;
