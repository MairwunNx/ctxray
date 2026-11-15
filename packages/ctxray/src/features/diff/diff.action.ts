import {
  checkoutRevision,
  DEFAULT_HARNESSES,
  findRoot,
  openProject,
  STATIC_ADAPTERS,
  staticPieces,
} from "#entities/harness/index.ts";
import { diffPieces, type LoadoutDiff } from "#entities/loadout/index.ts";
import type { Config } from "#entities/user-config/index.ts";
import type { HarnessId } from "#shared/contract/index.ts";

export type DiffRequest = { base: string; harnesses?: readonly HarnessId[] | undefined };
export type HarnessDiff = { harness: HarnessId; diff: LoadoutDiff };
export type DiffResult = { base: string; commit: string; diffs: HarnessDiff[] };

// What each harness would load at the project root on the base revision and now, as L3 predicts it.
export const createDiffAction =
  (config: Config, cwd: string) =>
  async ({ base, harnesses }: DiffRequest): Promise<DiffResult> => {
    const { root } = await findRoot(cwd);
    const configured = Object.keys(config.harnesses) as HarnessId[];
    const chosen = (harnesses ?? (configured.length > 0 ? configured : DEFAULT_HARNESSES)).filter(
      (id) => STATIC_ADAPTERS[id],
    );
    const revision = await checkoutRevision(root, base);
    try {
      const [before, after] = await Promise.all([openProject(revision.dir), openProject(root)]);
      const diffs: HarnessDiff[] = [];
      for (const harness of chosen) {
        const adapter = STATIC_ADAPTERS[harness];
        if (!adapter) continue;
        const scope = { cwd: "", files: [] };
        const was = adapter.resolve(await adapter.discover(before), scope);
        const is = adapter.resolve(await adapter.discover(after), scope);
        diffs.push({ harness, diff: diffPieces(staticPieces(was), staticPieces(is)) });
      }
      return { base, commit: revision.commit, diffs };
    } finally {
      await revision.remove();
    }
  };
createDiffAction.inject = ["config", "cwd"] as const;
export type DiffAction = ReturnType<typeof createDiffAction>;
