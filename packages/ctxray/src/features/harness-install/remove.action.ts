import { relative, resolve } from "node:path";
import { lockfilePath, readLockfile, writeLockfile } from "#entities/lockfile/index.ts";
import type { Config } from "#entities/user-config/index.ts";
import type { HarnessId, LockedHarness } from "#shared/contract/index.ts";
import { harnessIdOf } from "./lib/context.ts";

export type Unpinned = { harness: HarnessId; locked: LockedHarness | undefined };

// `ctxray harness remove codex`: drops harnesses from ctxray.lock. Their builds stay in the cache for
// `cache prune`. The config is the user's code, so a harness it still names is only reported.
export const createHarnessRemoveAction = (config: Config, cwd: string) => async (names: readonly string[]) => {
  const harnesses = names.map(harnessIdOf);
  const lockPath = lockfilePath(config.files, cwd);
  const lock = await readLockfile(lockPath);
  const unpinned: Unpinned[] = harnesses.map((harness) => ({ harness, locked: lock?.harnesses[harness] }));
  if (lock && unpinned.some((one) => one.locked !== undefined)) {
    for (const harness of harnesses) delete lock.harnesses[harness];
    await writeLockfile(lockPath, lock);
  }
  const configFile = config.files.at(-1);
  return {
    lockPath,
    unpinned,
    configured: harnesses.filter((harness) => config.harnesses[harness] !== undefined),
    configFile: configFile === undefined ? undefined : relative(cwd, resolve(cwd, configFile)),
  };
};
createHarnessRemoveAction.inject = ["config", "cwd"] as const;
export type HarnessRemoveAction = ReturnType<typeof createHarnessRemoveAction>;
