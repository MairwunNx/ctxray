import { join } from "node:path";
import { textOf } from "#shared/markdown/index.ts";
import { type Instruction, type Inventory, type Problem, problem, type Skill } from "../inventory.ts";
import { chainTo, joinPath, type Project } from "../project.ts";
import { readSkillFiles } from "../skill-file.ts";
import { type CodexConfig, readCodexConfig } from "./config.ts";
import { withinBudget } from "./resolve.ts";

const SKILL = /^(?:(.*)\/)?\.agents\/skills\/([^/]+)\/SKILL\.md$/;
const PROJECT_SKILL = /^()\.codex\/skills\/([^/]+)\/SKILL\.md$/;

// Per directory Codex takes the first non-empty file of AGENTS.override.md, AGENTS.md, and the fallbacks.
const findInstructions = async (project: Project, config: CodexConfig, problems: Problem[]) => {
  const instructions: Instruction[] = [];
  for (const dir of project.dirs) {
    let chosen: Instruction | undefined;
    for (const name of ["AGENTS.override.md", "AGENTS.md", ...config.fallbacks]) {
      const path = joinPath(dir, name);
      const text = await project.read(path);
      if (text === undefined) continue;
      if (text.trim() === "") problems.push(problem("lint.empty", "warning", path));
      else if (chosen) problems.push(problem("lint.shadowed", "warning", path, { by: chosen.path }));
      else chosen = { path, dir, kind: "agents", imports: [], text };
    }
    if (chosen) instructions.push(chosen);
  }
  return instructions;
};

// Codex refuses a SKILL.md without a name or a description.
const findSkills = async (project: Project, config: CodexConfig, problems: Problem[]): Promise<Skill[]> => {
  const files = [
    ...(await readSkillFiles(project, SKILL, problems)),
    ...(await readSkillFiles(project, PROJECT_SKILL, problems)),
  ];
  return files.map(({ path, dir, folder, frontmatter: { data, body } }) => {
    const name = textOf(data["name"]);
    const description = textOf(data["description"]);
    if (name === undefined) problems.push(problem("lint.skillField", "error", path, { field: "name" }));
    if (description === undefined) problems.push(problem("lint.skillField", "error", path, { field: "description" }));
    const valid = name !== undefined && description !== undefined;
    const listed = valid && !config.disabledSkills(name, join(project.root, path));
    return { name: name ?? folder, path, dir, description: description ?? "", listed, body };
  });
};

// A session started in a deep directory may hit the byte budget: Codex cuts the file that crosses it.
const overBudget = (instructions: readonly Instruction[], budget: number): Problem[] => {
  const cut = new Set<string>();
  for (const deepest of instructions) {
    const chain = chainTo(deepest.dir).flatMap((dir) => instructions.filter((file) => file.dir === dir));
    const kept = withinBudget(chain, budget);
    const first = kept.find((entry) => entry.cut)?.instruction ?? chain[kept.length];
    if (first) cut.add(first.path);
  }
  return [...cut].map((path) => problem("lint.budget", "warning", path, { budget }));
};

export const discoverCodex = async (project: Project): Promise<Inventory> => {
  const problems: Problem[] = [];
  const config = await readCodexConfig(project, problems);
  const instructions = await findInstructions(project, config, problems);
  return {
    harness: "codex",
    instructions,
    skills: await findSkills(project, config, problems),
    commands: [],
    mcp: config.mcp,
    problems: [...problems, ...overBudget(instructions, config.budget)],
    budget: config.budget,
  };
};
