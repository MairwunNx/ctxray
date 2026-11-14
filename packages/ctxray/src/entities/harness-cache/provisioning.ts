import type { HarnessId, LockedHarness } from "#shared/contract/index.ts";
import { currentPlatform, type Egress, type Env, type Platform } from "#shared/infra/index.ts";
import { resolveCacheDirs } from "./dirs.ts";
import { fail } from "./failure.ts";
import { createHarnessCache, type Installed, type Progress, type TarballSource } from "./install.ts";
import { readRegistrySetup } from "./npmrc.ts";
import { registrySource } from "./pack.ts";
import { createRegistry, type Registry } from "./registry.ts";

export type ProvisioningOptions = {
  project: string; // the folder whose .npmrc counts
  env: Env;
  registry: string | undefined; // `network.registry` from the config
  egress: Egress;
  offline: boolean;
  platform?: Platform;
};

// The cache, the registry, and the platform for one command. The registry is read only when something needs it,
// so a run that finds every harness in the cache never touches .npmrc or the network.
export const openProvisioning = async ({ project, env, registry, egress, offline, platform }: ProvisioningOptions) => {
  const dirs = await resolveCacheDirs(env);
  const cache = createHarnessCache(dirs);
  let client: Promise<Registry> | undefined;
  const registryClient = () => {
    client ??= readRegistrySetup(project, env, registry).then((setup) => createRegistry(setup, egress, offline));
    return client;
  };
  return {
    dirs,
    cache,
    platform: platform ?? currentPlatform(),
    registry: registryClient,
    source: async (): Promise<TarballSource> => registrySource(await registryClient()),
  };
};
export type Provisioning = Awaited<ReturnType<typeof openProvisioning>>;

export type Located = { binary: string; from: "path" | "cache" | "install"; installed?: Installed };

export type LocateOptions = {
  harness: HarnessId;
  locked: LockedHarness | undefined;
  system: boolean; // `source: "system"` in the config
  binary: string; // the executable's name on PATH
  path: string; // PATH
  install: boolean; // false with --no-install: a build missing from the cache fails
  onProgress?: (progress: Progress) => void;
};

// The executable a run starts: from PATH for `source: "system"` and harnesses the lockfile doesn't have, from
// the cache for locked ones, installing them first when they're missing.
export const locateHarness = async (
  provisioning: Provisioning,
  options: LocateOptions,
): Promise<Located | undefined> => {
  const { harness, locked } = options;
  if (options.system || locked === undefined || locked.source === "system") {
    const binary = Bun.which(options.binary, { PATH: options.path });
    return binary === null ? undefined : { binary, from: "path" };
  }
  const found = await provisioning.cache.find(harness, locked, provisioning.platform);
  if (found) return { binary: found.binary, from: "cache", installed: found };
  if (!options.install) fail("provision.notInstalled", { harness, version: locked.version });
  const source = await provisioning.source();
  const installed = await provisioning.cache.install(
    harness,
    locked,
    provisioning.platform,
    source,
    options.onProgress,
  );
  return { binary: installed.binary, from: "install", installed };
};
