import { lstat, realpath, stat } from "node:fs/promises";
import { join, posix, resolve } from "node:path";
import { $ } from "bun";
import { matchesGitignore } from "#shared/glob/index.ts";
import { inParallel } from "#shared/infra/index.ts";

// The repository under test, read-only. Paths are relative to the root, with `/`, and "" is the root itself.
export type Project = {
  root: string;
  // Files the repository holds: tracked and untracked, without what .gitignore hides.
  files: readonly string[];
  dirs: readonly string[];
  read: (path: string) => Promise<string | undefined>;
  // Reads in parallel and answers in the order of `paths`.
  readAll: (paths: readonly string[]) => Promise<(string | undefined)[]>;
  exists: (path: string) => Promise<boolean>;
};

const SKIPPED = /(^|\/)(\.git|node_modules)\//;

const nulSeparated = (text: string) => text.split("\0").filter((entry) => entry !== "");

// git lists a symlink to a folder as one entry, like `.claude/skills -> ../.agents/skills`. Harnesses follow
// the link, so the files behind it count under the link's path. Links that leave the project don't.
const behindLinks = async (root: string, links: readonly string[]) => {
  const found: string[] = [];
  const folders = new Set<string>();
  for (const link of links) {
    const target = await realpath(join(root, link)).catch(() => undefined);
    if (target === undefined || !(await stat(target)).isDirectory()) continue;
    // The link is a folder, not a file, whether the files behind it count or not.
    folders.add(link);
    if (!target.startsWith(`${root}/`)) continue;
    for await (const path of new Bun.Glob("**").scan({ cwd: target, dot: true, onlyFiles: true })) {
      found.push(`${link}/${path.replaceAll("\\", "/")}`);
    }
  }
  return { found, folders };
};

// Outside a repository, or without git installed, the exit code is not 0 and the walk takes over.
const gitFiles = async (root: string): Promise<string[] | undefined> => {
  const git = await $`git ls-files -z --cached --others --exclude-standard`.cwd(root).quiet().nothrow();
  if (git.exitCode !== 0) return undefined;
  const files = nulSeparated(git.stdout.toString());
  // Tracked links carry mode 120000. Untracked ones git knows nothing about, so lstat tells.
  const staged = nulSeparated(await $`git ls-files -s -z`.cwd(root).quiet().text());
  const untracked = nulSeparated(await $`git ls-files -z --others --exclude-standard`.cwd(root).quiet().text());
  const untrackedLinks = await inParallel(untracked, async (path) =>
    (await lstat(join(root, path)).catch(() => undefined))?.isSymbolicLink() ? path : undefined,
  );
  const links = [
    ...staged.filter((entry) => entry.startsWith("120000 ")).map((entry) => entry.slice(entry.indexOf("\t") + 1)),
    ...untrackedLinks.filter((path) => path !== undefined),
  ];
  const { found, folders } = await behindLinks(root, links);
  return [...files.filter((path) => !folders.has(path)), ...found];
};

const walkFiles = async (root: string): Promise<string[]> => {
  const files: string[] = [];
  for await (const path of new Bun.Glob("**").scan({ cwd: root, dot: true, onlyFiles: true, followSymlinks: true })) {
    const normal = path.replaceAll("\\", "/");
    if (!SKIPPED.test(normal)) files.push(normal);
  }
  return files.sort();
};

// The repository that holds `dir`, or `dir` itself outside one. Both come back without symlinks, so a path
// relative to the root never climbs out through /tmp → /private/tmp.
export const findRoot = async (dir: string): Promise<{ root: string; dir: string }> => {
  const real = await realpath(dir);
  const git = await $`git rev-parse --show-toplevel`.cwd(real).quiet().nothrow();
  return { root: git.exitCode === 0 ? await realpath(resolve(git.stdout.toString().trim())) : real, dir: real };
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
  const readAll = (paths: readonly string[]) => inParallel(paths, read);
  return { root, files, dirs, read, readAll, exists };
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
  return globs.find((pattern) => matchesGitignore(pattern, relative));
};

export type MatchedFile = { path: string; match: RegExpExecArray; text: string };

// Every file of the project whose path matches, read in parallel, in the project's order.
export const readMatching = async (project: Project, pattern: RegExp): Promise<MatchedFile[]> => {
  const matched = project.files.flatMap((path) => {
    const match = pattern.exec(path);
    return match ? [{ path, match }] : [];
  });
  const texts = await project.readAll(matched.map(({ path }) => path));
  return matched.flatMap((file, index) => {
    const text = texts[index];
    return text === undefined ? [] : [{ ...file, text }];
  });
};
