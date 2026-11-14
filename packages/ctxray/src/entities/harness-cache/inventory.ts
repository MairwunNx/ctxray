import { readdir, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import type { CacheDirs } from "./dirs.ts";
import { type Manifest, readManifest } from "./install.ts";

export type CachedBuild = Manifest & {
  dir: string;
  size: number; // bytes on disk
  lastUsed: Date; // the last run that used it, or the install
  shared: boolean; // in a read-only layer: listed, never pruned
};

const sizeOf = async (path: string): Promise<number> => {
  const info = await stat(path).catch(() => undefined);
  if (!info?.isDirectory()) return info?.size ?? 0;
  const entries = await readdir(path);
  let total = 0;
  for (const entry of entries) total += await sizeOf(join(path, entry));
  return total;
};

const lastUsed = async (dir: string) =>
  (await stat(`${dir}.used`).catch(() => undefined))?.mtime ?? (await stat(dir)).mtime;

// Every finished install in every layer. Locks, markers, and half-done downloads aren't builds.
export const listCache = async (dirs: CacheDirs): Promise<CachedBuild[]> => {
  const builds: CachedBuild[] = [];
  for (const root of dirs.all) {
    const harnesses = await readdir(join(root, "harnesses")).catch(() => []);
    for (const harness of harnesses) {
      for (const name of await readdir(join(root, "harnesses", harness)).catch(() => [])) {
        const dir = join(root, "harnesses", harness, name);
        const manifest = await readManifest(dir).catch(() => undefined);
        if (!manifest) continue;
        builds.push({
          ...manifest,
          dir,
          size: await sizeOf(dir),
          lastUsed: await lastUsed(dir),
          shared: root !== dirs.write,
        });
      }
    }
  }
  return builds.sort((a, b) => a.harness.localeCompare(b.harness) || Bun.semver.order(b.version, a.version));
};

export type PruneOptions = {
  keep: (build: CachedBuild) => boolean; // what the project's lockfile needs
  olderThan: number; // ms since the last use, 0 removes every build the project doesn't need
  now?: number;
};

// LRU: builds unused for a while go, the ones the project locks stay. Renamed away first, so a run that
// looks at the cache meanwhile sees a build whole or not at all.
export const pruneCache = async (dirs: CacheDirs, { keep, olderThan, now = Date.now() }: PruneOptions) => {
  const removed: CachedBuild[] = [];
  for (const build of await listCache(dirs)) {
    if (build.shared || keep(build) || now - build.lastUsed.getTime() < olderThan) continue;
    const doomed = `${build.dir}.removing-${crypto.randomUUID().slice(0, 8)}`;
    await rename(build.dir, doomed);
    await rm(doomed, { recursive: true, force: true });
    await rm(`${build.dir}.used`, { force: true });
    removed.push(build);
  }
  // Downloads a killed process left behind.
  if (dirs.write) {
    for (const name of await readdir(join(dirs.write, "tmp")).catch(() => [])) {
      const path = join(dirs.write, "tmp", name);
      const info = await stat(path).catch(() => undefined);
      if (info && now - info.mtimeMs > 3_600_000) await rm(path, { recursive: true, force: true });
    }
  }
  return removed;
};
