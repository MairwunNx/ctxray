import { realpath, stat } from "node:fs/promises";
import { type Inventory, openProject, STATIC_ADAPTERS } from "#entities/harness/index.ts";
import { CODEOWNERS_FILES, parseCodeowners } from "#shared/codeowners/index.ts";
import type { HarnessId } from "#shared/contract/index.ts";
import { fail } from "./failure.ts";
import type { Workspace } from "./scope.ts";

const memo = <K, V>(load: (key: K) => Promise<V>) => {
  const cache = new Map<K, Promise<V>>();
  return (key: K): Promise<V> => {
    const cached = cache.get(key) ?? load(key);
    cache.set(key, cached);
    return cached;
  };
};

const isFolder = (path: string) =>
  stat(path).then(
    (found) => found.isDirectory(),
    () => false,
  );

const openWorkspace = async (dir: string): Promise<Workspace> => {
  if (!(await isFolder(dir))) fail("test.noFixture", { dir });
  const root = await realpath(dir);
  const project = await openProject(root);
  const owners = (await project.readAll(CODEOWNERS_FILES)).find((text) => text !== undefined);
  return {
    root,
    project,
    codeowners: owners === undefined ? undefined : parseCodeowners(owners),
    inventoryOf: memo(async (harness: HarnessId): Promise<Inventory> => {
      const adapter = STATIC_ADAPTERS[harness] ?? fail("resolve.noAdapter", { harness });
      return adapter.discover(project);
    }),
  };
};

// Every test of a fixture shares one read of it, for the whole run.
export const createWorkspaces = () => memo(openWorkspace);
export type Workspaces = ReturnType<typeof createWorkspaces>;
