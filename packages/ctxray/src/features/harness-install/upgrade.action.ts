import { type Installed, type Progress, ProvisionFailure, resolveHarness } from "#entities/harness-cache/index.ts";
import { diffLoadouts, type LoadoutDiff } from "#entities/loadout/index.ts";
import { writeLockfile } from "#entities/lockfile/index.ts";
import type { Config } from "#entities/user-config/index.ts";
import type { HarnessId, LoadoutSnapshot, RegistryHarness } from "#shared/contract/index.ts";
import type { MessageKey, Params } from "#shared/i18n/index.ts";
import type { Env } from "#shared/infra/index.ts";
import { openHarnessContext, parseSpec } from "./lib/context.ts";

// The first request a build sends for this project on the mock model. The runner provides it through DI.
export type StartingLoadout = (harness: HarnessId, binary: string) => Promise<LoadoutSnapshot>;

export type UpgradeEvent =
  | { kind: "install"; harness: HarnessId; progress: Progress }
  | { kind: "capture"; harness: HarnessId; version: string };

export type Upgrade = {
  harness: HarnessId;
  before: RegistryHarness;
  after: RegistryHarness;
  diff: LoadoutDiff | undefined; // undefined when the version stays, or a capture failed
  failure: { key: MessageKey; params: Params } | undefined;
};

// `ctxray harness upgrade codex`: the newest version the range allows, with the loadout diff between the build
// in ctxray.lock and the new one, so the snapshot changes come with an explanation. --dry-run keeps the lockfile.
export const createHarnessUpgradeAction =
  (config: Config, env: Env, cwd: string, startingLoadout: StartingLoadout) =>
  async (specs: readonly string[], dryRun: boolean, onEvent: (event: UpgradeEvent) => void = () => {}) => {
    const context = await openHarnessContext(config, env, cwd);
    const lock = await context.readLock();
    const { cache, platform } = context.provisioning;
    const ensure = async (harness: HarnessId, locked: RegistryHarness): Promise<Installed> =>
      (await cache.find(harness, locked, platform)) ??
      cache.install(harness, locked, platform, await context.provisioning.source(), (progress) =>
        onEvent({ kind: "install", harness, progress }),
      );
    const loadoutOf = async (harness: HarnessId, locked: RegistryHarness) => {
      const installed = await ensure(harness, locked);
      onEvent({ kind: "capture", harness, version: locked.version });
      return startingLoadout(harness, installed.binary);
    };
    const upgrades: Upgrade[] = [];
    for (const spec of specs) {
      const { harness, range } = parseSpec(spec);
      const before = lock.harnesses[harness];
      if (before === undefined) throw new ProvisionFailure("lock.missing", { harness });
      if (before.source === "system") throw new ProvisionFailure("harness.upgradeSystem", { harness });
      const after = await resolveHarness(await context.provisioning.registry(), harness, range ?? before.range);
      let diff: LoadoutDiff | undefined;
      let failure: Upgrade["failure"];
      if (after.version !== before.version) {
        try {
          diff = diffLoadouts(await loadoutOf(harness, before), await loadoutOf(harness, after));
        } catch (error) {
          const known = error as { key?: MessageKey; params?: Params };
          failure = known.key
            ? { key: known.key, params: known.params ?? {} }
            : { key: "harness.captureFailed", params: { message: String(error) } };
        }
      }
      upgrades.push({ harness, before, after, diff, failure });
      lock.harnesses[harness] = after;
    }
    if (!dryRun) await writeLockfile(context.lockPath, lock);
    return { lockPath: context.lockPath, upgrades, dryRun };
  };
createHarnessUpgradeAction.inject = ["config", "env", "cwd", "startingLoadout"] as const;
export type HarnessUpgradeAction = ReturnType<typeof createHarnessUpgradeAction>;
