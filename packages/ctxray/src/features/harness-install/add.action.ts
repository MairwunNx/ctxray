import { resolveHarness } from "#entities/harness-cache/index.ts";
import { writeLockfile } from "#entities/lockfile/index.ts";
import type { Config } from "#entities/user-config/index.ts";
import type { HarnessId, LockedHarness } from "#shared/contract/index.ts";
import type { Env } from "#shared/infra/index.ts";
import { openHarnessContext, parseSpec, systemVersion } from "./lib/context.ts";

export type LockChange = { harness: HarnessId; before: LockedHarness | undefined; after: LockedHarness };

// `ctxray harness add codex@0.169.x`: resolves each harness and writes the result to ctxray.lock. Without a
// range it takes the config's `version`, then the harness's own channel. A harness from PATH gets its version.
export const createHarnessAddAction = (config: Config, env: Env, cwd: string) => async (specs: readonly string[]) => {
  const context = await openHarnessContext(config, env, cwd);
  const lock = await context.readLock();
  const changes: LockChange[] = [];
  for (const spec of specs) {
    const { harness, range } = parseSpec(spec);
    const settings = context.settingsOf(harness);
    const after: LockedHarness =
      settings?.source === "system"
        ? { source: "system", version: (await systemVersion(harness, env)).version }
        : await resolveHarness(await context.provisioning.registry(), harness, range ?? settings?.version);
    changes.push({ harness, before: lock.harnesses[harness], after });
    lock.harnesses[harness] = after;
  }
  await writeLockfile(context.lockPath, lock);
  return { lockPath: context.lockPath, changes };
};
createHarnessAddAction.inject = ["config", "env", "cwd"] as const;
export type HarnessAddAction = ReturnType<typeof createHarnessAddAction>;
