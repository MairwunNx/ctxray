import type { Installed } from "#entities/harness-cache/index.ts";
import type { Config } from "#entities/user-config/index.ts";
import type { HarnessId, LockedHarness } from "#shared/contract/index.ts";
import type { Env } from "#shared/infra/index.ts";
import { openHarnessContext } from "./lib/context.ts";

export type ListedHarness = {
  harness: HarnessId;
  locked: LockedHarness | undefined;
  configured: boolean;
  installed: Installed | undefined; // this platform's build in the cache
};

// `ctxray harness list`: what the lockfile pins, what the config asks for, and what this machine has.
export const createHarnessListAction = (config: Config, env: Env, cwd: string) => async () => {
  const context = await openHarnessContext(config, env, cwd);
  const lock = await context.readLock();
  const configured = (Object.keys(config.harnesses) as HarnessId[]).filter(context.installable);
  const ids = [...new Set([...(Object.keys(lock.harnesses) as HarnessId[]), ...configured])].sort();
  const rows: ListedHarness[] = [];
  for (const harness of ids) {
    const locked = lock.harnesses[harness];
    const installed =
      locked?.source === "registry"
        ? await context.provisioning.cache.find(harness, locked, context.provisioning.platform)
        : undefined;
    rows.push({ harness, locked, configured: configured.includes(harness), installed });
  }
  return { lockPath: context.lockPath, rows };
};
createHarnessListAction.inject = ["config", "env", "cwd"] as const;
export type HarnessListAction = ReturnType<typeof createHarnessListAction>;
