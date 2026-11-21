import {
  checkoutRevision,
  DEFAULT_HARNESSES,
  findRoot,
  openProject,
  rootPieces,
  STATIC_ADAPTERS,
} from "#entities/harness/index.ts";
import { diffPieces, type LoadoutDiff } from "#entities/loadout/index.ts";
import type { Config } from "#entities/user-config/index.ts";
import type { HarnessId } from "#shared/contract/index.ts";

export type DiffRequest = { base: string; harnesses?: readonly HarnessId[] | undefined };
export type HarnessDiff = { harness: HarnessId; diff: LoadoutDiff };
// Against a revision: its commit. Against a saved report: when it ran, and the harnesses it has no loadout of.
export type DiffResult = {
  base: string;
  commit?: string;
  createdAt?: string;
  diffs: HarnessDiff[];
  missing?: HarnessId[];
};

// The harnesses asked for, the config's, or the default set: those L3 can read.
export const chooseHarnesses = (config: Config, harnesses: readonly HarnessId[] | undefined) => {
  const configured = Object.keys(config.harnesses) as HarnessId[];
  return (harnesses ?? (configured.length > 0 ? configured : DEFAULT_HARNESSES)).filter((id) => STATIC_ADAPTERS[id]);
};

// What each harness would load at the project root on the base revision and now, as L3 predicts it.
export const createDiffAction =
  (config: Config, cwd: string) =>
  async ({ base, harnesses }: DiffRequest): Promise<DiffResult> => {
    const { root } = await findRoot(cwd);
    const revision = await checkoutRevision(root, base);
    try {
      const [before, after] = await Promise.all([openProject(revision.dir), openProject(root)]);
      const diffs: HarnessDiff[] = [];
      for (const harness of chooseHarnesses(config, harnesses)) {
        const adapter = STATIC_ADAPTERS[harness];
        const was = adapter && rootPieces(harness, await adapter.discover(before));
        const is = adapter && rootPieces(harness, await adapter.discover(after));
        if (was && is) diffs.push({ harness, diff: diffPieces(was, is) });
      }
      return { base, commit: revision.commit, diffs };
    } finally {
      await revision.remove();
    }
  };
createDiffAction.inject = ["config", "cwd"] as const;
export type DiffAction = ReturnType<typeof createDiffAction>;
