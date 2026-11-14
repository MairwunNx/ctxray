import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CAPTURE_ADAPTERS } from "#entities/harness/index.ts";
import { listCache, type Provisioning } from "#entities/harness-cache/index.ts";
import { LockfileFailure, lockProblems, readLockfile } from "#entities/lockfile/index.ts";
import type { Config } from "#entities/user-config/index.ts";
import type { HarnessId, LockedHarness, Lockfile } from "#shared/contract/index.ts";
import { type Env, platformKey } from "#shared/infra/index.ts";
import { check, type DoctorCheck } from "./model.ts";

export const cacheChecks = async (provisioning: Provisioning): Promise<DoctorCheck[]> => {
  const { dirs } = provisioning;
  const builds = await listCache(dirs);
  const size = Math.round(builds.filter((build) => !build.shared).reduce((sum, build) => sum + build.size, 0) / 1e6);
  return [
    dirs.write === undefined
      ? check("error", "doctor.cacheReadOnly", { dirs: dirs.all.join(", ") })
      : check("ok", "doctor.cache", { dir: dirs.write, count: builds.length, size }),
    ...dirs.all.filter((dir) => dir !== dirs.write).map((dir) => check("info", "doctor.cacheLayer", { dir })),
  ];
};

// A harness from PATH, asked for its version with a throwaway HOME: even `codex --version` writes into it.
const pathVersion = async (harness: HarnessId, env: Env) => {
  const adapter = CAPTURE_ADAPTERS[harness];
  const binary = adapter && Bun.which(adapter.binary, { PATH: env["PATH"] ?? "" });
  if (!adapter || !binary) return undefined;
  const home = await mkdtemp(join(tmpdir(), "ctxray-doctor-"));
  try {
    return await adapter.version(binary, { PATH: env["PATH"] ?? "", HOME: home }).catch(() => "?");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
};

const harnessCheck = async (harness: HarnessId, locked: LockedHarness, provisioning: Provisioning, env: Env) => {
  const runtime = CAPTURE_ADAPTERS[harness]?.runtime;
  if (runtime && !Bun.which(runtime, { PATH: env["PATH"] ?? "" }))
    return check("error", "doctor.noRuntime", { harness, runtime });
  if (locked.source === "system") {
    const version = await pathVersion(harness, env);
    if (version === undefined) return check("error", "doctor.systemMissing", { harness });
    if (version !== locked.version)
      return check("warning", "doctor.systemDiffers", { harness, version, locked: locked.version });
    return check("ok", "doctor.fromPath", { harness, version });
  }
  const platform = platformKey(provisioning.platform);
  if (locked.platforms[platform] === undefined)
    return check("error", "doctor.noBuild", { harness, version: locked.version, platform });
  const found = await provisioning.cache.find(harness, locked, provisioning.platform);
  return found
    ? check("ok", "doctor.installed", { harness, version: locked.version })
    : check("warning", "doctor.notInstalled", { harness, version: locked.version });
};

// The lockfile, how it agrees with the config, and whether this machine has what it pins.
export const lockChecks = async (
  lockPath: string,
  shown: string,
  config: Config,
  provisioning: Provisioning,
  env: Env,
) => {
  let lock: Lockfile | undefined;
  try {
    lock = await readLockfile(lockPath);
  } catch (error) {
    if (error instanceof LockfileFailure) return [check("error", error.problem.key, error.problem.params)];
    throw error;
  }
  if (lock === undefined) return [check("info", "doctor.noLockfile", { file: shown })];
  const configured = (Object.keys(config.harnesses) as HarnessId[]).filter((harness) => CAPTURE_ADAPTERS[harness]);
  const checks: DoctorCheck[] = [check("ok", "doctor.lockfile", { file: shown })];
  checks.push(
    ...lockProblems(lock, configured, (harness) => config.harnesses[harness]).map((problem) =>
      check("warning", problem.key, problem.params),
    ),
  );
  for (const [harness, locked] of Object.entries(lock.harnesses)) {
    if (locked) checks.push(await harnessCheck(harness as HarnessId, locked, provisioning, env));
  }
  return checks;
};
