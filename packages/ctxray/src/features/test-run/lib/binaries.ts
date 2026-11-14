import { dirname } from "node:path";
import { CAPTURE_ADAPTERS } from "#entities/harness/index.ts";
import { locateHarness, openProvisioning, type Progress, ProvisionFailure } from "#entities/harness-cache/index.ts";
import { LockfileFailure, lockfilePath, lockProblems, readLockfile } from "#entities/lockfile/index.ts";
import { type Config, egressOf, resolveNetwork } from "#entities/user-config/index.ts";
import type { HarnessId } from "#shared/contract/index.ts";
import type { Env } from "#shared/infra/index.ts";
import { CheckFailure, fail } from "./failure.ts";

export type BinaryOptions = {
  frozen: boolean; // CI: the lockfile must match the config
  install: boolean; // false with --no-install
  onInstall: (harness: HarnessId, progress: Progress) => void;
};

// The executable of each harness for this run, found once: from the cache by ctxray.lock, installed into it when
// missing, or from PATH for `source: "system"` and harnesses the lockfile doesn't pin. Undefined: not on PATH.
export const createBinaries = (config: Config, env: Env, cwd: string, options: BinaryOptions) => {
  const lockPath = lockfilePath(config.files, cwd);
  const ready = (async () => {
    const lock = await readLockfile(lockPath);
    const provisioning = await openProvisioning({
      project: dirname(lockPath),
      env,
      registry: config.network.registry,
      egress: await egressOf(resolveNetwork(config, env)),
      offline: config.offline,
    });
    return { lock, provisioning };
  })();
  const found = new Map<HarnessId, Promise<string | undefined>>();
  const locate = async (harness: HarnessId) => {
    const adapter = CAPTURE_ADAPTERS[harness] ?? fail("capture.noAdapter", { harness });
    const { lock, provisioning } = await ready;
    const settings = config.harnesses[harness];
    const [problem] = options.frozen ? lockProblems(lock, [harness], (id) => config.harnesses[id]) : [];
    if (problem) fail(problem.key, problem.params);
    const located = await locateHarness(provisioning, {
      harness,
      locked: lock?.harnesses[harness],
      system: settings?.source === "system",
      binary: adapter.binary,
      path: env["PATH"] ?? "",
      install: options.install,
      onProgress: (progress) => options.onInstall(harness, progress),
    });
    return located?.binary;
  };
  // Failures of the cache and the lockfile read like any other check failure.
  return (harness: HarnessId) => {
    const known =
      found.get(harness) ??
      locate(harness).catch((error) => {
        if (error instanceof ProvisionFailure) throw new CheckFailure(error.key, error.params);
        if (error instanceof LockfileFailure) throw new CheckFailure(error.problem.key, error.problem.params);
        throw error;
      });
    found.set(harness, known);
    return known;
  };
};
export type Binaries = ReturnType<typeof createBinaries>;
