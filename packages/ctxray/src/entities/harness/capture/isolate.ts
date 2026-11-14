import { constants } from "node:fs";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { $ } from "bun";
import { inParallel } from "#shared/infra/index.ts";
import type { Project } from "../project.ts";
import { withCanary } from "./canary.ts";

// The folders of one harness run. Nothing in them belongs to the user: the project is a copy.
export type RunDirs = {
  root: string;
  work: string; // the project copy, with canaries
  home: string; // HOME, and XDG folders under it
  tmp: string;
  bin: string; // first on PATH: shims for tools a harness must not reach
  logs: string; // MCP shim logs
};

// macOS `security`: Claude Code looks up the keychain even with an API key set. This answers “not found”.
const SECURITY_SHIM = "#!/bin/sh\nexit 44\n";

// Git without the user's config and hooks: the copy needs only a commit, so harnesses see a clean repository.
const gitEnv = (home: string) => ({
  PATH: process.env["PATH"] ?? "/usr/bin:/bin",
  HOME: home,
  GIT_CONFIG_NOSYSTEM: "1",
});
const IDENTITY = ["-c", "user.name=ctxray", "-c", "user.email=ctxray@localhost", "-c", "commit.gpgsign=false"];

// A symlink is copied as the link it is, so the harness sees the project's layout.
const copyFiles = (from: string, to: string, paths: readonly string[]) =>
  inParallel(paths, async (path) => {
    await mkdir(dirname(join(to, path)), { recursive: true });
    const link = await readlink(join(from, path)).catch(() => undefined);
    if (link !== undefined) return symlink(link, join(to, path)).catch(() => {});
    // git still lists a tracked file the user deleted: there's nothing to copy then.
    await copyFile(join(from, path), join(to, path), constants.COPYFILE_FICLONE).catch(() => {});
  });

// The working tree's changes since HEAD: what to copy over a clone, and what to delete from it.
const changesOf = async (root: string) => {
  const status = await $`git status --porcelain -z --untracked-files=all`.cwd(root).quiet().text();
  const entries = status.split("\0");
  const copy: string[] = [];
  const remove: string[] = [];
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index] ?? "";
    if (entry === "") continue;
    const [code, path] = [entry.slice(0, 2), entry.slice(3)];
    if (code.startsWith("R") || code.startsWith("C")) remove.push(entries[++index] ?? "");
    (code.includes("D") ? remove : copy).push(path);
  }
  // git status says nothing about files flagged skip-worktree (S) or assume-unchanged (lower case): their
  // working tree state is whatever the user made it, so it comes from there.
  const flagged = (await $`git ls-files -v -z`.cwd(root).quiet().text())
    .split("\0")
    .filter((entry) => /^(S|[a-z]) /.test(entry))
    .map((entry) => entry.slice(2));
  for (const path of flagged) ((await Bun.file(join(root, path)).exists()) ? copy : remove).push(path);
  return { copy, remove };
};

const isGitRoot = async (root: string) => {
  const top = await $`git rev-parse --show-toplevel`.cwd(root).quiet().nothrow();
  return top.exitCode === 0 && (await realpath(top.stdout.toString().trim())) === root;
};

// The project copy and, for each canary, the other paths that are the same file through a symlink.
export type ProjectCopy = { work: string; aliases: Readonly<Record<string, readonly string[]>> };

// Symlinks stay symlinks: each real file gets one canary, named after itself when it's a candidate too,
// else after its first link. A link that leads out of the project gets none: ctxray writes only in the copy.
const markCanaries = async (work: string, canaries: ReadonlySet<string>) => {
  const byFile = new Map<string, string[]>();
  for (const path of canaries) {
    const real = await realpath(join(work, path)).catch(() => undefined);
    if (real === undefined || !real.startsWith(`${work}/`)) continue;
    byFile.set(real, [...(byFile.get(real) ?? []), path]);
  }
  const aliases: Record<string, string[]> = {};
  await inParallel([...byFile], async ([real, paths]) => {
    const own = relative(work, real);
    const name = paths.includes(own) ? own : (paths[0] as string);
    aliases[name] = paths.filter((path) => path !== name);
    await writeFile(real, withCanary(await readFile(real, "utf8"), name));
  });
  return aliases;
};

// A committed copy of the project as the user has it now, canaries included. A repository is cloned with
// shared objects, then its uncommitted changes go on top: hashing a large tree anew takes minutes. A folder
// inside a repository, like a fixture, is copied file by file.
export const createCopy = async (project: Project, canaries: ReadonlySet<string>): Promise<ProjectCopy> => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "ctxray-copy-")));
  const work = join(root, "work");
  const env = gitEnv(root);
  const head = await $`git rev-parse --verify -q HEAD`.cwd(project.root).quiet().nothrow();
  if ((await isGitRoot(project.root)) && head.exitCode === 0) {
    await $`git clone -q --shared --no-hardlinks ${project.root} ${work}`.env(env).quiet();
    const { copy, remove } = await changesOf(project.root);
    await copyFiles(project.root, work, copy);
    await Promise.all(remove.map((path) => rm(join(work, path), { force: true })));
  } else {
    await copyFiles(project.root, work, project.files);
    await $`git init -q`.cwd(work).env(env).quiet();
  }
  const aliases = await markCanaries(work, canaries);
  await $`git add -A`.cwd(work).env(env).quiet();
  await $`git ${IDENTITY} -c core.hooksPath=/dev/null commit -q --no-verify --allow-empty -m ctxray`
    .cwd(work)
    .env(env)
    .quiet();
  return { work, aliases };
};

// Clones a copy for one session. A copy-on-write clone where the file system has them: APFS, Btrfs, XFS.
const cloneTree = (from: string, to: string) =>
  process.platform === "darwin" ? $`cp -cR ${from} ${to}`.quiet() : $`cp -R --reflink=auto ${from} ${to}`.quiet();

export const isolate = async ({ work: copy }: ProjectCopy): Promise<RunDirs> => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "ctxray-run-")));
  const dirs: RunDirs = {
    root,
    work: join(root, "work"),
    home: join(root, "home"),
    tmp: join(root, "tmp"),
    bin: join(root, "bin"),
    logs: join(root, "logs"),
  };
  await Promise.all([dirs.home, dirs.tmp, dirs.bin, dirs.logs].map((dir) => mkdir(dir, { recursive: true })));
  await cloneTree(copy, dirs.work);
  await writeFile(join(dirs.bin, "security"), SECURITY_SHIM);
  await chmod(join(dirs.bin, "security"), 0o755);
  return dirs;
};
