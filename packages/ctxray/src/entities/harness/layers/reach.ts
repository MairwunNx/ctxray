import { posix } from "node:path";
import type { HarnessId } from "#shared/contract/index.ts";
import type { MessageKey } from "#shared/i18n/index.ts";
import { splitFrontmatter, textOf } from "#shared/markdown/index.ts";
import { type Inventory, type Problem, problem, type Severity } from "../inventory.ts";
import { isAgentFile, readersOf } from "../locations.ts";
import { PROFILES } from "../profiles.ts";
import { dirOf, isInside, type Project } from "../project.ts";
import { comparable, indexReach, type ReachIndex } from "./reach-index.ts";

const SKILL = /(^|\/)SKILL\.md$/;
// Markdown in these folders is written for agents, whatever its name.
const AGENT_FOLDER = /(^|\/)\.(agents|claude|codex|cursor|gemini|opencode)\//;
const FOR_PEOPLE = /(^|\/)(README|CHANGELOG|LICENSE)\.md$/i;
// Subagents and TOML commands: ctxray doesn't take them into an inventory, so their place says who reads them.
const OWN_KIND = /\/(commands?|agents?)\//;
const BY_PLACE_ONLY = /\/agents?\/[^/]+\.md$|\.toml$/;

export type ReachOptions = { differences: boolean }; // false skips “the harnesses get different instructions”

// One harness or several: the message agrees with the number, “only OpenCode reads” or “only … read”.
type Kind = "nowhere" | "otherHarness" | "otherHarnesses" | "differs" | "differsMany";
const KEYS: Record<Kind, { file: MessageKey; skills: MessageKey; severity: Severity }> = {
  nowhere: { file: "reach.nowhere", skills: "reach.nowhereSkills", severity: "error" },
  otherHarness: { file: "reach.otherHarness", skills: "reach.otherHarnessSkills", severity: "warning" },
  otherHarnesses: { file: "reach.otherHarnesses", skills: "reach.otherHarnessesSkills", severity: "warning" },
  differs: { file: "reach.differs", skills: "reach.differsSkills", severity: "warning" },
  differsMany: { file: "reach.differsMany", skills: "reach.differsManySkills", severity: "warning" },
};

const titles = (ids: readonly HarnessId[]) => ids.map((id) => PROFILES[id].title);

// Whether a harness that doesn't read the file still gets what it says: through a copy, a symlink, an import,
// or the same text in a file it does read. A skill counts when it has a skill of that name with the same text.
const covered = async (project: Project, index: ReachIndex, id: HarnessId, path: string) => {
  const text = (await project.read(path)) ?? "";
  const harness = index.of(id);
  if (SKILL.test(path)) {
    const { data, body } = splitFrontmatter(text);
    const names = [textOf(data["name"]), posix.basename(posix.dirname(path))];
    return names.some((name) => name !== undefined && harness.skills.get(name) === comparable(body));
  }
  const own = comparable(text);
  return own === "" || harness.instructions.includes(own);
};

// Skills report by folder, `.agents/skills (48)`, the rest file by file.
const createReport = (ids: readonly HarnessId[]) => {
  const found: Partial<Record<HarnessId, Problem[]>> = Object.fromEntries(ids.map((id) => [id, []]));
  const skills = new Map<
    string,
    { id: HarnessId; kind: Kind; root: string; params: Problem["params"]; count: number }
  >();
  const add = (id: HarnessId, path: string, kind: Kind, params: Problem["params"] = {}) => {
    if (!SKILL.test(path)) return found[id]?.push(problem(KEYS[kind].file, KEYS[kind].severity, path, params));
    const root = posix.dirname(posix.dirname(path));
    const group = [id, kind, root, JSON.stringify(params)].join("\0");
    const entry = skills.get(group) ?? { id, kind, root, params, count: 0 };
    entry.count++;
    skills.set(group, entry);
  };
  const done = () => {
    for (const { id, kind, root, params, count } of skills.values()) {
      found[id]?.push(problem(KEYS[kind].skills, KEYS[kind].severity, root, { ...params, count }));
    }
    return found;
  };
  return { add, done };
};

// L1 across harnesses. Errors: agent files no harness reads at all, since they reach no model. Warnings: files
// only a harness outside the run reads, and harnesses of the run that get different instructions or skills.
export const checkReach = async (
  project: Project,
  inventories: Partial<Record<HarnessId, Inventory>>,
  { differences }: ReachOptions = { differences: true },
): Promise<Partial<Record<HarnessId, Problem[]>>> => {
  const index = await indexReach(project, inventories);
  const { ids } = index;
  const report = createReport(ids);
  const skillFolders = project.files.filter((path) => SKILL.test(path)).map(dirOf);
  const strayMarkdown = (path: string) =>
    path.endsWith(".md") &&
    AGENT_FOLDER.test(path) &&
    !FOR_PEOPLE.test(path) &&
    !index.linked.has(path) &&
    !skillFolders.some((folder) => isInside(path, folder));
  const candidates = project.files.filter((path) => isAgentFile(path) || SKILL.test(path) || strayMarkdown(path));

  for (const path of candidates) {
    const byPlace = readersOf(path);
    const readers = ids.filter((id) => index.of(id).reads(path) || (BY_PLACE_ONLY.test(path) && byPlace.includes(id)));
    if (readers.length === 0) {
      // The text may still reach every harness of the run, like an AGENTS.md that matches the CLAUDE.md.
      if ((await Promise.all(ids.map((id) => covered(project, index, id, path)))).every(Boolean)) continue;
      const elsewhere = byPlace.filter((id) => !ids.includes(id));
      for (const id of ids) {
        const kind = elsewhere.length > 1 ? "otherHarnesses" : "otherHarness";
        if (elsewhere.length > 0) report.add(id, path, kind, { harnesses: titles(elsewhere) });
        else report.add(id, path, "nowhere");
      }
      continue;
    }
    // Commands and subagents are each harness's own: a harness without them has nothing to compare.
    if (!differences || OWN_KIND.test(path)) continue;
    for (const id of ids.filter((one) => !readers.includes(one))) {
      if (await covered(project, index, id, path)) continue;
      const kind = readers.length > 1 ? "differsMany" : "differs";
      report.add(id, path, kind, { harness: PROFILES[id].title, by: titles(readers) });
    }
  }
  return report.done();
};
