import { chmod, copyFile, mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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

// Copies the project's files (the ones git would keep) into a fresh folder, marks `canaries` there, and
// commits the copy.
export const isolate = async (project: Project, canaries: ReadonlySet<string>): Promise<RunDirs> => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "ctxray-run-")));
  const dirs: RunDirs = {
    root,
    work: join(root, "work"),
    home: join(root, "home"),
    tmp: join(root, "tmp"),
    bin: join(root, "bin"),
    logs: join(root, "logs"),
  };
  await Promise.all(
    [dirs.work, dirs.home, dirs.tmp, dirs.bin, dirs.logs].map((dir) => mkdir(dir, { recursive: true })),
  );
  await inParallel(project.files, async (path) => {
    const target = join(dirs.work, path);
    await mkdir(dirname(target), { recursive: true });
    // git still lists a tracked file the user deleted: there's nothing to copy then.
    if (!canaries.has(path)) return copyFile(join(project.root, path), target).catch(() => {});
    return writeFile(target, withCanary((await project.read(path)) ?? "", path));
  });
  await writeFile(join(dirs.bin, "security"), SECURITY_SHIM);
  await chmod(join(dirs.bin, "security"), 0o755);
  // Git without the user's config and hooks: the copy needs only a commit, so harnesses see a repository.
  const env = { PATH: process.env["PATH"] ?? "/usr/bin:/bin", HOME: dirs.home, GIT_CONFIG_NOSYSTEM: "1" };
  const config = ["-c", "user.name=ctxray", "-c", "user.email=ctxray@localhost", "-c", "commit.gpgsign=false"];
  await $`git init -q`.cwd(dirs.work).env(env).quiet();
  await $`git add -A`.cwd(dirs.work).env(env).quiet();
  await $`git ${config} -c core.hooksPath=/dev/null commit -q --no-verify -m fixture`.cwd(dirs.work).env(env).quiet();
  return dirs;
};
