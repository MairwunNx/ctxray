import { checkoutRevision, openProject, STATIC_ADAPTERS, staticPieces } from "#entities/harness/index.ts";
import { diffPieces, type LoadoutDiff } from "#entities/loadout/index.ts";
import type { HarnessId } from "#shared/contract/index.ts";

export type BaseDiff = { ref: string; diffs: { harness: HarnessId; diff: LoadoutDiff }[] };

// --base: what L3 predicts at the project root on that revision and now, for the report. Like `ctxray diff`.
export const diffAgainst = async (root: string, ref: string, harnesses: readonly HarnessId[]): Promise<BaseDiff> => {
  const revision = await checkoutRevision(root, ref);
  try {
    const [before, after] = await Promise.all([openProject(revision.dir), openProject(root)]);
    const diffs: BaseDiff["diffs"] = [];
    for (const harness of harnesses) {
      const adapter = STATIC_ADAPTERS[harness];
      if (!adapter) continue;
      const scope = { cwd: "", files: [] };
      const was = adapter.resolve(await adapter.discover(before), scope);
      const is = adapter.resolve(await adapter.discover(after), scope);
      diffs.push({ harness, diff: diffPieces(staticPieces(was), staticPieces(is)) });
    }
    return { ref, diffs };
  } finally {
    await revision.remove();
  }
};
