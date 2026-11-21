import { dirname, relative } from "node:path";
import { cacheCandidates, openProvisioning } from "#entities/harness-cache/index.ts";
import { lockfilePath } from "#entities/lockfile/index.ts";
import { type Config, egressOf, resolveNetwork } from "#entities/user-config/index.ts";
import { type Env, platformKey } from "#shared/infra/index.ts";
import { fixHarnesses, missingDirs, type OnProgress } from "./lib/fix.ts";
import { cacheChecks, lockChecks } from "./lib/harnesses.ts";
import { check, type DoctorSection } from "./lib/model.ts";
import { caChecks, keyChecks, proxyChecks, registryChecks } from "./lib/network.ts";
import { systemChecks } from "./lib/system.ts";

export type DoctorRequest = { fix: boolean; onProgress: OnProgress };

// `ctxray doctor`: what the machine needs for L4 and up, checked before a run trips over it (TASK §6.6). With
// `--fix` it first does the safe part and the checks then show what's left.
export const createDoctorAction =
  (config: Config, env: Env, cwd: string, version: string) =>
  async ({ fix, onProgress }: DoctorRequest = { fix: false, onProgress: () => {} }) => {
    const network = resolveNetwork(config, env);
    // A CA file that's missing gets its own error below, the requests go on without it.
    const egress = await egressOf(network).catch(() => ({
      proxy: network.httpsProxy ?? network.httpProxy,
      noProxy: network.noProxy,
      ca: [],
    }));
    const lockPath = lockfilePath(config.files, cwd);
    const missing = fix ? await missingDirs(cacheCandidates(env)) : [];
    const provisioning = await openProvisioning({
      project: dirname(lockPath),
      env,
      registry: config.network.registry,
      egress,
      offline: config.offline,
    });
    const fixes = fix ? await fixHarnesses(lockPath, provisioning, missing, onProgress) : undefined;
    const sections: DoctorSection[] = [
      {
        title: "doctor.titleSystem",
        checks: [
          check("info", "doctor.ctxray", { version, platform: platformKey(provisioning.platform) }),
          ...(await systemChecks(env)),
        ],
      },
      {
        title: "doctor.titleNetwork",
        checks: [
          ...proxyChecks(network, env),
          ...(await caChecks(network)),
          ...(await registryChecks(dirname(lockPath), env, config.network.registry, egress, config.offline)),
          ...keyChecks(env, config.upstream),
        ],
      },
      {
        title: "doctor.titleHarnesses",
        checks: [
          ...(await cacheChecks(provisioning)),
          ...(await lockChecks(lockPath, relative(cwd, lockPath), config, provisioning, env)),
        ],
      },
    ];
    return { sections, fixes };
  };
createDoctorAction.inject = ["config", "env", "cwd", "version"] as const;
export type DoctorAction = ReturnType<typeof createDoctorAction>;
