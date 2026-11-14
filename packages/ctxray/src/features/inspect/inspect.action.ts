import { realpath, stat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import {
  checkReach,
  findDeadRules,
  findRoot,
  type Inventory,
  lint,
  openProject,
  type Problem,
  type Project,
  type Scope,
  STATIC_ADAPTERS,
  type StaticAdapter,
} from "#entities/harness/index.ts";
import type { Config } from "#entities/user-config/index.ts";
import type { HarnessId } from "#shared/contract/index.ts";
import { type InspectedHarness, toInspection } from "./inspection.ts";

export type InspectRequest = {
  harnesses?: readonly HarnessId[] | undefined;
  // Where the agent starts and the files it works with, relative to where ctxray runs.
  cwd?: string | undefined;
  files?: readonly string[] | undefined;
};

export type InspectResult = {
  root: string;
  scope: Scope;
  harnesses: InspectedHarness[];
  // Asked for, but ctxray can't read their files yet.
  unsupported: HarnessId[];
};

// `--cwd` named a folder that isn't there.
export type MissingFolder = { missingFolder: string };

const isFolder = (path: string) =>
  stat(path).then(
    (found) => found.isDirectory(),
    () => false,
  );

const STATIC = Object.keys(STATIC_ADAPTERS) as HarnessId[];

// The flag wins, then the harnesses the config tests, then every harness ctxray can read.
const chooseHarnesses = (request: InspectRequest, config: Config): readonly HarnessId[] => {
  const configured = Object.keys(config.harnesses) as HarnessId[];
  return request.harnesses ?? (configured.length > 0 ? configured : STATIC);
};

const byPlace = (a: Problem, b: Problem) => a.path.localeCompare(b.path) || (a.line ?? 0) - (b.line ?? 0);

const inspectOne = async (
  project: Project,
  adapter: StaticAdapter,
  inventory: Inventory,
  scope: Scope,
  unread: readonly Problem[],
): Promise<InspectedHarness> => {
  const problems = [...(await lint(project, inventory)), ...findDeadRules(project, inventory), ...unread];
  return toInspection(adapter.resolve(inventory, scope), inventory, scope, problems.toSorted(byPlace));
};

export const createInspectAction =
  (config: Config, cwd: string) =>
  async (request: InspectRequest = {}): Promise<InspectResult | MissingFolder> => {
    const here = await realpath(cwd);
    const start = resolve(here, request.cwd ?? ".");
    if (!(await isFolder(start))) return { missingFolder: request.cwd ?? "." };
    const { root, dir } = await findRoot(start);
    const inRoot = (path: string) => relative(root, path).split(sep).join("/");
    // A file outside the repository loads nothing.
    const files = (request.files ?? []).map((file) => inRoot(resolve(here, file))).filter((f) => !f.startsWith(".."));
    const scope: Scope = { cwd: inRoot(dir), files };
    const project = await openProject(root);
    const ids = chooseHarnesses(request, config);
    const readable = ids.flatMap((id) => {
      const adapter = STATIC_ADAPTERS[id];
      return adapter ? [{ id, adapter }] : [];
    });
    const inventories = await Promise.all(readable.map(({ adapter }) => adapter.discover(project)));
    const unread = await checkReach(
      project,
      Object.fromEntries(readable.map(({ id }, index) => [id, inventories[index]])),
    );
    const harnesses = await Promise.all(
      readable.map(({ id, adapter }, index) =>
        inspectOne(project, adapter, inventories[index] as Inventory, scope, unread[id] ?? []),
      ),
    );
    return { root, scope, harnesses, unsupported: ids.filter((id) => !STATIC_ADAPTERS[id]) };
  };
createInspectAction.inject = ["config", "cwd"] as const;
export type InspectAction = ReturnType<typeof createInspectAction>;
