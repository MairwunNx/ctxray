import { type Instruction, type Inventory, type Problem, problem } from "../inventory.ts";
import { isWithin, type Project } from "../project.ts";
import { findCommands, findMcp, findSkills } from "./extras.ts";
import { findInstructions } from "./instructions.ts";

export const isClaudeFile = (instruction: Instruction): boolean =>
  instruction.kind === "memory" || instruction.kind === "local";

// By default Claude Code reads AGENTS.md only where no CLAUDE.md sits in the directory or above it.
const ignoredAgents = (instructions: readonly Instruction[]): Problem[] =>
  instructions
    .filter((agents) => agents.kind === "agents")
    .filter((agents) => instructions.some((file) => isClaudeFile(file) && isWithin(agents.dir, file.dir)))
    .filter((agents) => !instructions.some((file) => file.imports.includes(agents.path)))
    .map((agents) => problem("lint.agentsIgnored", "warning", agents.path));

export const discoverClaudeCode = async (project: Project): Promise<Inventory> => {
  const problems: Problem[] = [];
  const found = await findInstructions(project);
  const skills = await findSkills(project, problems);
  const commands = await findCommands(project);
  // A skill and a command with one name: the skill wins.
  for (const command of commands) {
    const skill = skills.find((candidate) => candidate.name === command.name);
    if (skill)
      problems.push(problem("lint.shadowedCommand", "warning", command.path, { name: command.name, by: skill.path }));
  }
  return {
    harness: "claude-code",
    instructions: found.instructions,
    skills,
    commands,
    mcp: await findMcp(project, problems),
    problems: [...found.problems, ...ignoredAgents(found.instructions), ...problems],
  };
};
