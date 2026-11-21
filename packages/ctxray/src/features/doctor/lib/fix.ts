import { stat } from "node:fs/promises";
import { type Progress, ProvisionFailure, type Provisioning } from "#entities/harness-cache/index.ts";
import { readLockfile } from "#entities/lockfile/index.ts";
import type { HarnessId } from "#shared/contract/index.ts";
import { platformKey } from "#shared/infra/index.ts";
import { check, type DoctorCheck } from "./model.ts";

export type OnProgress = (harness: HarnessId, progress: Progress) => void;

// The cache folders that don't exist yet: `--fix` reports the one ctxray then creates.
export const missingDirs = async (dirs: readonly string[]) => {
  const found = await Promise.all(dirs.map((dir) => stat(dir).catch(() => undefined)));
  return dirs.filter((_, index) => found[index] === undefined);
};

// `doctor --fix` does only what can't hurt: it creates the cache folder and installs the builds ctxray.lock pins
// for this platform. Git, the network, proxies, CA certificates, and Node stay with the user.
export const fixHarnesses = async (
  lockPath: string,
  provisioning: Provisioning,
  missing: readonly string[],
  onProgress: OnProgress,
): Promise<DoctorCheck[]> => {
  const { dirs, platform } = provisioning;
  const fixes: DoctorCheck[] = [];
  if (dirs.write !== undefined && missing.includes(dirs.write))
    fixes.push(check("ok", "doctor.fixedCache", { dir: dirs.write }));
  if (dirs.write === undefined) return fixes;
  const lock = await readLockfile(lockPath).catch(() => undefined);
  for (const [id, locked] of Object.entries(lock?.harnesses ?? {})) {
    const harness = id as HarnessId;
    if (locked?.source !== "registry" || locked.platforms[platformKey(platform)] === undefined) continue;
    if (await provisioning.cache.find(harness, locked, platform)) continue;
    const params = { harness, version: locked.version };
    try {
      await provisioning.cache.install(harness, locked, platform, await provisioning.source(), (progress) =>
        onProgress(harness, progress),
      );
      fixes.push(check("ok", "doctor.fixedInstall", params));
    } catch (error) {
      // A provisioning failure says what went wrong in its own words, anything else gets its message.
      fixes.push(
        error instanceof ProvisionFailure
          ? check("error", error.key, error.params)
          : check("error", "doctor.fixFailed", { ...params, message: String((error as Error).message ?? error) }),
      );
    }
  }
  return fixes;
};
