import { type CachedBuild, listCache, pruneCache, resolveCacheDirs } from "#entities/harness-cache/index.ts";
import { lockfilePath, readLockfile } from "#entities/lockfile/index.ts";
import type { Config } from "#entities/user-config/index.ts";
import type { Env } from "#shared/infra/index.ts";

const DAY = 86_400_000;

// `ctxray cache dir`, `ls`, and `prune`: the harness cache on this machine, shared by every project.
export const createCacheAction = (config: Config, env: Env, cwd: string) => ({
  dirs: () => resolveCacheDirs(env),
  list: async () => listCache(await resolveCacheDirs(env)),
  // Builds unused for `days` go, or every one with `days` 0. The builds this project's lockfile pins stay.
  prune: async (days: number): Promise<CachedBuild[]> => {
    const lock = await readLockfile(lockfilePath(config.files, cwd)).catch(() => undefined);
    const pinned = new Set(
      Object.values(lock?.harnesses ?? {}).flatMap((locked) =>
        locked?.source === "registry" ? Object.values(locked.platforms).map((build) => build.integrity) : [],
      ),
    );
    return pruneCache(await resolveCacheDirs(env), {
      keep: (build) => pinned.has(build.integrity),
      olderThan: days * DAY,
    });
  },
});
createCacheAction.inject = ["config", "env", "cwd"] as const;
export type CacheAction = ReturnType<typeof createCacheAction>;
