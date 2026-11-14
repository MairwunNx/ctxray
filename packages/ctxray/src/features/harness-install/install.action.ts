import { archiveSource, type Installed, type Progress, type TarballSource } from "#entities/harness-cache/index.ts";
import { type LockProblem, lockProblems } from "#entities/lockfile/index.ts";
import type { Config } from "#entities/user-config/index.ts";
import type { HarnessId } from "#shared/contract/index.ts";
import { type Env, isCi, platformKey } from "#shared/infra/index.ts";
import { openHarnessContext, systemVersion } from "./lib/context.ts";

export type InstallRequest = {
  only: readonly HarnessId[] | undefined; // --only, every locked harness otherwise
  frozen: boolean; // --frozen, on by itself in CI
  from: string | undefined; // --from: an archive from `ctxray harness pack` instead of the registry
};

export type InstallOutcome =
  | { harness: HarnessId; kind: "cache" | "install"; installed: Installed; duration: number }
  | { harness: HarnessId; kind: "path"; version: string; locked: string }
  | { harness: HarnessId; kind: "missing" };

export type InstallResult = {
  platform: string;
  problems: readonly LockProblem[];
  frozen: boolean;
  outcomes: InstallOutcome[];
};

// `ctxray harness install`: everything ctxray.lock holds for this platform, like `bun install`. Frozen, any
// mismatch with the config stops it before a single download.
export const createHarnessInstallAction =
  (config: Config, env: Env, cwd: string) =>
  async (request: InstallRequest, onProgress: (harness: HarnessId, progress: Progress) => void = () => {}) => {
    const context = await openHarnessContext(config, env, cwd);
    const lock = await context.readLock();
    const frozen = request.frozen || isCi(env);
    const configured = (Object.keys(config.harnesses) as HarnessId[]).filter(context.installable);
    const locked = Object.keys(lock.harnesses) as HarnessId[];
    const wanted = request.only ?? [...new Set([...locked, ...configured])];
    const problems = lockProblems(lock, request.only ?? configured, context.settingsOf);
    const platform = platformKey(context.provisioning.platform);
    const result: InstallResult = { platform, problems, frozen, outcomes: [] };
    if (frozen && problems.length > 0) return result;
    let source: TarballSource | undefined;
    for (const harness of wanted) {
      const entry = lock.harnesses[harness];
      if (entry === undefined) continue;
      if (entry.source === "system") {
        const found = await systemVersion(harness, env).catch(() => undefined);
        result.outcomes.push(
          found
            ? { harness, kind: "path", version: found.version, locked: entry.version }
            : { harness, kind: "missing" },
        );
        continue;
      }
      const started = performance.now();
      const cached = await context.provisioning.cache.find(harness, entry, context.provisioning.platform);
      if (cached) {
        result.outcomes.push({ harness, kind: "cache", installed: cached, duration: 0 });
        continue;
      }
      source ??= request.from === undefined ? await context.provisioning.source() : await archiveSource(request.from);
      const installed = await context.provisioning.cache.install(
        harness,
        entry,
        context.provisioning.platform,
        source,
        (progress) => onProgress(harness, progress),
      );
      // Another process may have installed it while this one waited.
      const kind = installed.fresh ? "install" : "cache";
      result.outcomes.push({ harness, kind, installed, duration: performance.now() - started });
    }
    return result;
  };
createHarnessInstallAction.inject = ["config", "env", "cwd"] as const;
export type HarnessInstallAction = ReturnType<typeof createHarnessInstallAction>;
