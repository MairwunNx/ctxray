import { lstat, readlink, realpath } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { $ } from "bun";
import type { HarnessId } from "#shared/contract/index.ts";
import { inParallel } from "#shared/infra/index.ts";
import { type Problem, problem } from "../inventory.ts";
import { configReadersOf, readersOf } from "../locations.ts";
import { PROFILES } from "../profiles.ts";
import type { Project } from "../project.ts";

// Files a harness reads on your machine that the team and CI never get: hidden by .gitignore, not committed
// yet, or behind a symlink that's broken or leaves the repository. CLAUDE.local.md is personal by design.
const PERSONAL = /(^|\/)CLAUDE\.local\.md$/;
const HARNESS_FOLDER = /(^|\/)\.(claude|cursor|agents|codex|gemini|opencode)(\/|$)/;

const readersOfFile = (path: string): HarnessId[] => [...new Set([...readersOf(path), ...configReadersOf(path)])];
const nul = (text: string) => text.split("\0").filter((entry) => entry !== "");

type Ignored = { files: string[]; folders: { path: string; files: string[] }[] };

// git folds an ignored folder into one entry. The harness folders among them get walked and reported whole.
const ignoredFiles = async (root: string): Promise<Ignored> => {
  const found: Ignored = { files: [], folders: [] };
  const git = await $`git ls-files -z --others --ignored --exclude-standard --directory`.cwd(root).quiet().nothrow();
  if (git.exitCode !== 0) return found;
  for (const entry of nul(git.stdout.toString())) {
    if (!entry.endsWith("/")) found.files.push(entry);
    else if (HARNESS_FOLDER.test(entry)) {
      const files: string[] = [];
      for await (const path of new Bun.Glob("**").scan({ cwd: join(root, entry), dot: true, onlyFiles: true })) {
        files.push(`${entry}${path.replaceAll("\\", "/")}`);
      }
      found.folders.push({ path: entry.slice(0, -1), files });
    }
  }
  return found;
};

const untrackedFiles = async (root: string): Promise<string[]> => {
  const git = await $`git ls-files -z --others --exclude-standard`.cwd(root).quiet().nothrow();
  return git.exitCode === 0 ? nul(git.stdout.toString()) : [];
};

type Finding = {
  path: string;
  key: "lint.ignoredFile" | "lint.uncommittedFile" | "lint.brokenSymlink" | "lint.outsideLink";
  target?: string;
};

// A symlinked agent file or harness folder whose target is missing or outside the repository.
const linkProblem = async (root: string, path: string): Promise<Finding | undefined> => {
  const stats = await lstat(join(root, path)).catch(() => undefined);
  if (!stats?.isSymbolicLink()) return undefined;
  const target = await readlink(join(root, path)).catch(() => "?");
  const real = await realpath(join(root, path)).catch(() => undefined);
  if (real === undefined) return { path, key: "lint.brokenSymlink", target };
  const inside = relative(root, real).split(sep).join("/");
  return inside.startsWith("..") ? { path, key: "lint.outsideLink", target } : undefined;
};

// Every symlink git knows or would add: a link to a folder outside the project leaves no files behind in the
// project's list, so git tells where the links are.
const symlinks = async (root: string, untracked: readonly string[]) => {
  const staged = await $`git ls-files -s -z`.cwd(root).quiet().nothrow();
  const tracked = nul(staged.stdout.toString())
    .filter((entry) => entry.startsWith("120000 "))
    .map((entry) => entry.slice(entry.indexOf("\t") + 1));
  return [...tracked, ...untracked];
};

export const checkSharing = async (
  project: Project,
  ids: readonly HarnessId[],
): Promise<Partial<Record<HarnessId, Problem[]>>> => {
  const [ignored, untracked] = await Promise.all([ignoredFiles(project.root), untrackedFiles(project.root)]);
  const linked = (await symlinks(project.root, untracked)).filter(
    (path) => readersOfFile(path).length > 0 || HARNESS_FOLDER.test(path),
  );
  const links = await inParallel(linked, (path) => linkProblem(project.root, path));
  const findings: Finding[] = [
    ...ignored.files
      .filter((path) => readersOfFile(path).length > 0)
      .map((path) => ({ path, key: "lint.ignoredFile" as const })),
    ...untracked
      .filter((path) => readersOfFile(path).length > 0)
      .map((path) => ({ path, key: "lint.uncommittedFile" as const })),
    ...links.filter((found) => found !== undefined),
  ];
  const report: Partial<Record<HarnessId, Problem[]>> = Object.fromEntries(ids.map((id) => [id, []]));
  for (const { path, key, target } of findings) {
    if (PERSONAL.test(path)) continue;
    // A link to a whole harness folder concerns every harness of the run.
    const readers = readersOfFile(path);
    const severity = key === "lint.brokenSymlink" ? "error" : "warning";
    for (const id of readers.length > 0 ? ids.filter((one) => readers.includes(one)) : ids) {
      report[id]?.push(problem(key, severity, path, { harness: PROFILES[id].title, ...(target ? { target } : {}) }));
    }
  }
  for (const folder of ignored.folders) {
    for (const id of ids) {
      const count = folder.files.filter((path) => !PERSONAL.test(path) && readersOfFile(path).includes(id)).length;
      if (count > 0)
        report[id]?.push(problem("lint.ignoredFolder", "warning", folder.path, { harness: PROFILES[id].title, count }));
    }
  }
  return report;
};
