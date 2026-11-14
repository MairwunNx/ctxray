import { realpath } from "node:fs/promises";
import { join, posix } from "node:path";
import type { HarnessId } from "#shared/contract/index.ts";
import { inParallel } from "#shared/infra/index.ts";
import { findLinks } from "#shared/markdown/index.ts";
import { type Inventory, type Problem, problem } from "../inventory.ts";
import { PROFILES } from "../profiles.ts";
import { dirOf, isInside, joinPath, type Project } from "../project.ts";

const SKILL = /(^|\/)SKILL\.md$/;
const CLAUDE_FILE = /(^|\/)CLAUDE(?:\.local)?\.md$/;
const AGENTS_FILE = /(^|\/)AGENTS(?:\.override)?\.md$/;
// Folders that only agents read: a Markdown file there is meant for one. `.agents` is shared, the others
// belong to one harness and count only when it takes part.
const AGENT_FOLDER = /(?:^|\/)\.(agents|claude|codex|gemini|opencode)\//;
const FOLDER_OWNER: Record<string, HarnessId | undefined> = {
  agents: undefined,
  claude: "claude-code",
  codex: "codex",
  gemini: "gemini-cli",
  opencode: "opencode",
};
const FOR_PEOPLE = /(^|\/)(README|CHANGELOG|LICENSE)\.md$/i;

const readSet = (inventory: Inventory) =>
  new Set([
    ...inventory.instructions.map((file) => file.path),
    ...inventory.skills.map((skill) => skill.path),
    ...inventory.commands.map((command) => command.path),
  ]);

// What the read files point at: `@imports` and Markdown links. A file one of them names gets read on demand.
const linkedFrom = (inventories: readonly Inventory[]) => {
  const linked = new Set<string>();
  for (const inventory of inventories) {
    for (const file of inventory.instructions) for (const path of file.imports) linked.add(path);
    const documents = [
      ...inventory.instructions.map(({ path, text }) => ({ path, text })),
      ...[...inventory.skills, ...inventory.commands].map(({ path, body }) => ({ path, text: body })),
    ];
    for (const { path, text } of documents) {
      for (const link of findLinks(text)) linked.add(joinPath(dirOf(path), link.target));
    }
  }
  return linked;
};

// L1 across harnesses: files written for agents that a configured harness never reads. Each one is a design
// error, not a matter of taste: the instructions or skills in it reach no model.
export const checkReach = async (
  project: Project,
  inventories: Partial<Record<HarnessId, Inventory>>,
): Promise<Partial<Record<HarnessId, Problem[]>>> => {
  const ids = Object.keys(inventories) as HarnessId[];
  // One file under two paths, through a symlink, is read when either path is.
  const candidates = [
    ...new Set([...project.files, ...ids.flatMap((id) => [...readSet(inventories[id] as Inventory)])]),
  ];
  const reals = await inParallel(candidates, (path) => realpath(join(project.root, path)).catch(() => path));
  const realOf = new Map(candidates.map((path, index) => [path, reals[index] ?? path]));
  const real = (path: string) => realOf.get(path) ?? path;
  const readReal = new Map(ids.map((id) => [id, new Set([...readSet(inventories[id] as Inventory)].map(real))]));
  const read = new Map(ids.map((id) => [id, { has: (path: string) => readReal.get(id)?.has(real(path)) ?? false }]));
  const title = (id: HarnessId) => PROFILES[id].title;
  const found: Partial<Record<HarnessId, Problem[]>> = Object.fromEntries(ids.map((id) => [id, []]));
  const report = (id: HarnessId, item: Problem) => found[id]?.push(item);

  // Skills, by the folder that holds them: `.agents/skills (48)` reads better than 48 lines.
  const skills = project.files.filter((path) => SKILL.test(path));
  const roots = Map.groupBy(skills, (path) => posix.dirname(posix.dirname(path)));
  for (const [root, paths] of roots) {
    const readers = ids.filter((id) => paths.some((path) => read.get(id)?.has(path)));
    for (const id of ids) {
      const missed = paths.filter((path) => !read.get(id)?.has(path)).length;
      if (missed === 0) continue;
      if (readers.length === 0) report(id, problem("reach.skillsNowhere", "error", root, { count: missed }));
      else {
        const by = readers.map(title).join(", ");
        report(id, problem("reach.skillsMissed", "error", root, { harness: title(id), count: missed, by }));
      }
    }
  }

  // Codex reads AGENTS.md only: a folder with a CLAUDE.md and no AGENTS.md tells Codex nothing.
  if (inventories.codex) {
    const agentsDirs = new Set(project.files.filter((path) => AGENTS_FILE.test(path)).map(dirOf));
    for (const path of project.files.filter((file) => CLAUDE_FILE.test(file) && !agentsDirs.has(dirOf(file)))) {
      report("codex", problem("reach.claudeOnly", "error", path));
    }
  }

  // Anything else in an agent folder: read by a harness, linked from what one reads, or part of a skill.
  const linked = linkedFrom(ids.map((id) => inventories[id] as Inventory));
  const skillFolders = skills.map(dirOf);
  const covered = (path: string) => {
    const folder = AGENT_FOLDER.exec(path)?.[1];
    if (folder === undefined) return false;
    const owner = FOLDER_OWNER[folder];
    return owner === undefined || ids.includes(owner);
  };
  const stray = project.files.filter(
    (path) =>
      path.endsWith(".md") &&
      covered(path) &&
      !SKILL.test(path) &&
      !FOR_PEOPLE.test(path) &&
      !linked.has(path) &&
      !ids.some((id) => read.get(id)?.has(path)) &&
      !skillFolders.some((folder) => isInside(path, folder)),
  );
  for (const path of stray) for (const id of ids) report(id, problem("reach.unread", "error", path));
  return found;
};
