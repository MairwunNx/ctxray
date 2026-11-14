import { join } from "node:path";
import type { HarnessId } from "#shared/contract/index.ts";
import { STATIC_ADAPTERS } from "./adapters.ts";
import { findDeadRules } from "./layers/dead-rules.ts";
import { lint } from "./layers/lint.ts";
import { openProject } from "./project.ts";
import type { Scope } from "./static-loadout.ts";

export const FIXTURES = join(import.meta.dir, "../../../fixtures/static");

// L1 and the dead rules of L3 for one fixture, as `severity key path[:line]` lines that read well in a diff.
export const findingsOf = async (fixture: string, harness: HarnessId): Promise<string[]> => {
  const project = await openProject(join(FIXTURES, fixture));
  const adapter = STATIC_ADAPTERS[harness];
  if (!adapter) throw new Error(`no static adapter for ${harness}`);
  const inventory = await adapter.discover(project);
  const problems = [...(await lint(project, inventory)), ...findDeadRules(project, inventory)];
  return problems
    .map(({ severity, key, path, line }) => `${severity} ${key} ${path}${line === undefined ? "" : `:${line}`}`)
    .sort();
};

export const resolveIn = async (fixture: string, harness: HarnessId, scope: Partial<Scope> = {}) => {
  const project = await openProject(join(FIXTURES, fixture));
  const adapter = STATIC_ADAPTERS[harness];
  if (!adapter) throw new Error(`no static adapter for ${harness}`);
  const inventory = await adapter.discover(project);
  return { project, inventory, loadout: adapter.resolve(inventory, { cwd: "", files: [], ...scope }) };
};
