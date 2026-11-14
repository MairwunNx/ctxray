import { join, posix } from "node:path";
import { $ } from "bun";
import { gitignoreGlob } from "#shared/glob/index.ts";

// The repository under test, read-only. Paths are relative to the root, with `/`, and "" is the root itself.
export type Project = {
  root: string;
  // Files the repository holds: tracked and untracked, without what .gitignore hides.
  files: readonly string[];
  dirs: readonly string[];
  read: (path: string) => Promise<string | undefined>;
  exists: (path: string) => Promise<boolean>;
};

const SKIPPED = /(^|\/)(\.git|node_modules)\//;

// Outside a repository, or without git installed, the exit code is not 0 and the walk takes over.
const gitFiles = async (root: string): Promise<string[] | undefined> => {
  const git = await $`git ls-files -z --cached --others --exclude-standard`.cwd(root).quiet().nothrow();
  if (git.exitCode !== 0) return undefined;
  return git.stdout
    .toString()
    .split("\0")
    .filter((path) => path !== "");
};

const walkFiles = async (root: string): Promise<string[]> => {
  const files: string[] = [];
  for await (const path of new Bun.Glob("**").scan({ cwd: root, dot: true, onlyFiles: true })) {
    const normal = path.replaceAll("\\", "/");
    if (!SKIPPED.test(normal)) files.push(normal);
  }
  return files.sort();
};

export const parentDirs = (path: string): string[] => {
  const dirs = [""];
  const parts = path.split("/").slice(0, -1);
  for (let index = 1; index <= parts.length; index++) dirs.push(parts.slice(0, index).join("/"));
  return dirs;
};

export const openProject = async (root: string): Promise<Project> => {
  const files = (await gitFiles(root)) ?? (await walkFiles(root));
  const known = new Set(files);
  const dirs = [...new Set(files.flatMap(parentDirs))].sort();
  const read = async (path: string) => {
    const file = Bun.file(join(root, path));
    return (await file.exists()) ? file.text() : undefined;
  };
  // Ignored files like CLAUDE.local.md are missing from the list but still count.
  const exists = async (path: string) => known.has(path) || Bun.file(join(root, path)).exists();
  return { root, files, dirs, read, exists };
};

export const joinPath = (dir: string, path: string): string => posix.normalize(dir === "" ? path : `${dir}/${path}`);

export const dirOf = (path: string): string => {
  const dir = posix.dirname(path);
  return dir === "." ? "" : dir;
};

// "" is the root, so every directory is inside it.
export const isInside = (path: string, dir: string): boolean => dir === "" || path.startsWith(`${dir}/`);

// The directory itself or one below it.
export const isWithin = (dir: string, ancestor: string): boolean => dir === ancestor || isInside(dir, ancestor);

// The root, the cwd, and every directory between them, from the top down.
export const chainTo = (cwd: string): string[] => (cwd === "" ? [""] : parentDirs(`${cwd}/.`));

// The first pattern of `globs` that matches the file, relative to `dir`.
export const matchingGlob = (globs: readonly string[], dir: string, file: string): string | undefined => {
  if (!isInside(file, dir)) return undefined;
  const relative = dir === "" ? file : file.slice(dir.length + 1);
  return globs.find((pattern) => gitignoreGlob(pattern).match(relative));
};
