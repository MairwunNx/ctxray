import type { HarnessId, LimitsInput, LintConfig } from "#shared/contract/index.ts";
import type { Inventory, Problem } from "../inventory.ts";
import type { Project } from "../project.ts";
import { findDeadRules } from "./dead-rules.ts";
import { lint } from "./lint.ts";
import { applyLintConfig, limitsFor, projectPaths } from "./lint-config.ts";

export type FileCheckSettings = { lint: LintConfig; limits: LimitsInput | undefined };

// L1 for one harness as the config shapes it: lint, dead rules, and what the reach check found for it, with
// the levels, ignores, overrides, and suppressions of the config applied.
export const checkFiles = async (
  project: Project,
  inventory: Inventory,
  harness: HarnessId,
  { lint: config, limits }: FileCheckSettings,
  unread: readonly Problem[] = [],
): Promise<Problem[]> => {
  const pathsOf = projectPaths(project.root);
  return applyLintConfig(
    [
      ...(await lint(project, inventory, limitsFor(config, limits, harness, pathsOf))),
      ...findDeadRules(project, inventory),
      ...unread,
    ],
    project,
    config,
    harness,
    pathsOf,
  );
};
