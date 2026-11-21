import { access, constants, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import type { Env } from "#shared/infra/index.ts";

// Where harnesses live: `write` takes new installs, `all` is searched in order and includes it. With
// CTXRAY_CACHE_DIRS a shared read-only cache (on NFS, in a runner image) sits next to a local one.
export type CacheDirs = { readonly write: string | undefined; readonly all: readonly string[] };

const present = (value: string | undefined) => (value === undefined || value === "" ? undefined : value);

// The platform's own cache folder, like Playwright's browsers and Bun's packages (TASK §6.1).
export const defaultCacheDir = (env: Env, os: string = process.platform, home: string = homedir()) => {
  const own = present(env["CTXRAY_CACHE_DIR"]);
  if (own !== undefined) return resolve(own);
  if (os === "darwin") return join(home, "Library", "Caches", "ctxray");
  if (os === "win32") return join(present(env["LOCALAPPDATA"]) ?? join(home, "AppData", "Local"), "ctxray", "Cache");
  return join(present(env["XDG_CACHE_HOME"]) ?? join(home, ".cache"), "ctxray");
};

const writable = async (dir: string) => {
  try {
    await mkdir(dir, { recursive: true });
    await access(dir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
};

// A relative folder is taken from where ctxray starts: harnesses launch elsewhere and need absolute paths.
// The first directory ctxray can write to takes the installs, every one is searched.
export const cacheCandidates = (env: Env): string[] => {
  const listed = (present(env["CTXRAY_CACHE_DIRS"]) ?? "")
    .split(delimiter)
    .map((dir) => dir.trim())
    .filter((dir) => dir !== "")
    .map((dir) => resolve(dir));
  return listed.length > 0 ? listed : [defaultCacheDir(env)];
};

export const resolveCacheDirs = async (env: Env): Promise<CacheDirs> => {
  const all = cacheCandidates(env);
  for (const dir of all) if (await writable(dir)) return { write: dir, all };
  return { write: undefined, all };
};
