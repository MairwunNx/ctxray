import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CAPTURE_ADAPTERS } from "#entities/harness/index.ts";
import { openProvisioning, ProvisionFailure, RECIPES } from "#entities/harness-cache/index.ts";
import { emptyLockfile, lockfilePath, readLockfile } from "#entities/lockfile/index.ts";
import { type Config, egressOf, resolveNetwork } from "#entities/user-config/index.ts";
import { type HarnessId, HarnessId as HarnessIds } from "#shared/contract/index.ts";
import type { Env } from "#shared/infra/index.ts";

// What every `ctxray harness` subcommand works with: the lockfile, the cache, and the user's registry.
export const openHarnessContext = async (config: Config, env: Env, cwd: string) => {
  const lockPath = lockfilePath(config.files, cwd);
  const provisioning = await openProvisioning({
    project: join(lockPath, ".."),
    env,
    registry: config.network.registry,
    egress: await egressOf(resolveNetwork(config, env)),
    offline: config.offline,
  });
  const settingsOf = (harness: HarnessId) => config.harnesses[harness];
  return {
    lockPath,
    provisioning,
    settingsOf,
    readLock: async () => (await readLockfile(lockPath)) ?? emptyLockfile(),
    // Harnesses ctxray can put on a machine: the ones it installs from npm, and any the config takes from PATH.
    installable: (harness: HarnessId) => RECIPES[harness] !== undefined || settingsOf(harness)?.source === "system",
  };
};
export type HarnessContext = Awaited<ReturnType<typeof openHarnessContext>>;

export const harnessIdOf = (name: string): HarnessId => {
  const parsed = HarnessIds.safeParse(name);
  if (!parsed.success) throw new ProvisionFailure("harness.unknown", { name, known: HarnessIds.options.join(", ") });
  return parsed.data;
};

// `codex@0.169.x` → codex and its range. A scoped-looking name has no meaning here, so the first @ splits.
export const parseSpec = (spec: string) => {
  const at = spec.indexOf("@");
  return at === -1
    ? { harness: harnessIdOf(spec), range: undefined }
    : { harness: harnessIdOf(spec.slice(0, at)), range: spec.slice(at + 1) || undefined };
};

// The version of a harness from PATH, read with a throwaway HOME: even `codex --version` writes into it.
export const systemVersion = async (harness: HarnessId, env: Env) => {
  const adapter = CAPTURE_ADAPTERS[harness];
  if (!adapter) throw new ProvisionFailure("provision.unsupported", { harness });
  const binary = Bun.which(adapter.binary, { PATH: env["PATH"] ?? "" });
  if (binary === null) throw new ProvisionFailure("harness.notOnPath", { harness, binary: adapter.binary });
  const home = await mkdtemp(join(tmpdir(), "ctxray-version-"));
  try {
    return { binary, version: await adapter.version(binary, { PATH: env["PATH"] ?? "", HOME: home }) };
  } finally {
    await rm(home, { recursive: true, force: true });
  }
};
