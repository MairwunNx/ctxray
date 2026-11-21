import type { HarnessId, LoadoutPieces } from "#shared/contract/index.ts";
import { STATIC_ADAPTERS } from "./adapters.ts";
import type { Inventory } from "./inventory.ts";
import { staticPieces } from "./revision.ts";

// What L3 predicts at the project root with no files open: what `ctxray diff` compares and a report keeps.
export const rootPieces = (harness: HarnessId, inventory: Inventory): LoadoutPieces | undefined => {
  const adapter = STATIC_ADAPTERS[harness];
  return adapter && staticPieces(adapter.resolve(inventory, { cwd: "", files: [] }));
};
