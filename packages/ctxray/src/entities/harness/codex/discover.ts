import { join } from "node:path";
import { textOf } from "#shared/markdown/index.ts";
import { type Instruction, type Inventory, type Problem, problem, type Skill } from "../inventory.ts";
import { listingProblems } from "../listing-lint.ts";
import { chainTo, joinPath, type Project } from "../project.ts";
import { readSkillFiles } from "../skill-file.ts";
import { type CodexConfig, readCodexConfig } from "./config.ts";
import { withinBudget } from "./resolve.ts";

// Codex looks into subfolders too: .agents/skills/payments/refunds/SKILL.md is the skill refunds (spike 0017).
const SKILL = /^(?:(.*)\/)?\.agents\/skills\/(?:.+\/)?([^/]+)\/SKILL\.md$/;
const PROJECT_SKILL = /^()\.codex\/skills\/(?:.+\/)?([^/]+)\/SKILL\.md$/;

// Per directory Codex takes the first non-empty file of AGENTS.override.md, AGENTS.md, and the fallbacks.
const findInstructions = async (project: Project, config: CodexConfig, problems: Problem[]) => {
  const names = ["AGENTS.override.md", "AGENTS.md", ...config.fallbacks];
  const paths = project.dirs.flatMap((dir) => names.map((name) => joinPath(dir, name)));
  const texts = await project.readAll(paths);
  return project.dirs.flatMap((dir, at): Instruction[] => {
    let chosen: Instruction | undefined;
    names.forEach((_, offset) => {
      const index = at * names.length + offset;
      const [path, text] = [paths[index] ?? "", texts[index]];
      if (text === undefined) return;
      if (text.trim() === "") problems.push(problem("lint.empty", "warning", path, { harness: "Codex" }));
      else if (chosen) problems.push(problem("lint.shadowed", "warning", path, { by: chosen.path }));
      else chosen = { path, dir, kind: "agents", imports: [], text };
    });
    return chosen ? [chosen] : [];
  });
};

// Codex refuses a SKILL.md without a name or a description, one that starts with a byte order mark, and one
// with tabs in its frontmatter.
const findSkills = async (project: Project, config: CodexConfig, problems: Problem[]): Promise<Skill[]> => {
  const [nested, own] = await Promise.all([
    readSkillFiles(project, SKILL, problems),
    readSkillFiles(project, PROJECT_SKILL, problems),
  ]);
  const files = [...nested, ...own];
  return files.map(({ path, dir, folder, bom, frontmatter: { data, body, tabs } }) => {
    const name = textOf(data["name"]);
    const description = textOf(data["description"]);
    if (name === undefined)
      problems.push(problem("lint.skillField", "error", path, { harness: "Codex", field: "name" }));
    if (description === undefined)
      problems.push(problem("lint.skillField", "error", path, { harness: "Codex", field: "description" }));
    if (bom) problems.push(problem("lint.byteOrderMark", "error", path, { harness: "Codex" }));
    const valid = name !== undefined && description !== undefined && !bom && !tabs;
    const listed = valid && !config.disabledSkills(name, join(project.root, path));
    return { name: name ?? folder, path, dir, description: description ?? "", listed, body };
  });
};

// A session started in a deep directory may hit the byte budget: Codex cuts the file that crosses it.
const overBudget = (instructions: readonly Instruction[], budget: number): Problem[] => {
  // A file over the budget on its own gets cut wherever the agent starts, the others only below their parents.
  const cut = new Map<string, Problem>();
  for (const deepest of instructions) {
    const chain = chainTo(deepest.dir).flatMap((dir) => instructions.filter((file) => file.dir === dir));
    const kept = withinBudget(chain, budget);
    const first = kept.find((entry) => entry.cut)?.instruction ?? chain[kept.length];
    if (!first || cut.has(first.path)) continue;
    const alone = Buffer.byteLength(first.text) > budget;
    cut.set(first.path, problem(alone ? "lint.overBudget" : "lint.budget", "warning", first.path, { budget }));
  }
  return [...cut.values()];
};

export const discoverCodex = async (project: Project): Promise<Inventory> => {
  const problems: Problem[] = [];
  const config = await readCodexConfig(project, problems);
  const skillProblems: Problem[] = [];
  const [instructions, skills] = await Promise.all([
    findInstructions(project, config, problems),
    findSkills(project, config, skillProblems),
  ]);
  return {
    harness: "codex",
    instructions,
    skills,
    commands: [],
    mcp: config.mcp,
    problems: [
      ...problems,
      ...skillProblems,
      ...listingProblems("codex", skills),
      ...overBudget(instructions, config.budget),
    ],
    budget: config.budget,
  };
};
