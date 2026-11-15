import { join } from "node:path";
import type { HarnessId } from "#shared/contract/index.ts";
import type { CellScope } from "./scope.ts";
import { createWorkspaces } from "./workspace.ts";

export const PAYMENTS = join(import.meta.dir, "../../../../fixtures/static/payments");

// A cell on the payments fixture, the way the runner builds one.
export const scopeIn = async (harness: HarnessId, snapshot: CellScope["snapshot"] = () => {}): Promise<CellScope> => {
  const workspace = await createWorkspaces()(PAYMENTS);
  return {
    harness,
    workspace,
    inventory: await workspace.inventoryOf(harness),
    snapshot,
    stats: [],
    sessions: [],
    seen: new Set<string>(),
  };
};
