import { AsyncLocalStorage } from "node:async_hooks";
import type { Inventory, Project } from "#entities/harness/index.ts";
import type { Codeowners } from "#shared/codeowners/index.ts";
import type { HarnessId } from "#shared/contract/index.ts";
import { fail } from "./failure.ts";

// A project the tests look at: the repository, or a suite's fixture. Read-only, opened once per run.
export type Workspace = {
  root: string;
  project: Project;
  codeowners: Codeowners | undefined;
  inventoryOf: (harness: HarnessId) => Promise<Inventory>;
};

export type SnapshotCheck = (value: unknown, variant: string) => void;

// What a test body runs against: one harness in one workspace.
export type CellScope = {
  harness: HarnessId;
  workspace: Workspace;
  inventory: Inventory;
  snapshot: SnapshotCheck;
};

// `expect.on()` and `discover` sets are module functions, so they find their harness here.
const cells = new AsyncLocalStorage<CellScope>();

export const inCell = <T>(scope: CellScope, run: () => T): T => cells.run(scope, run);

export const currentCell = (): CellScope => cells.getStore() ?? fail("dsl.outsideTest");
