import { type Instruction, type Inventory, type Problem, problem } from "../inventory.ts";
import { listingProblems } from "../listing-lint.ts";
import { isWithin, type Project } from "../project.ts";
import { findCommands, findMcp, findSkills } from "./extras.ts";
import { findInstructions } from "./instructions.ts";

export const isClaudeFile = (instruction: Instruction): boolean =>
  instruction.kind === "memory" || instruction.kind === "local";

// By default Claude Code reads AGENTS.md only where no CLAUDE.md sits in the directory or above it, unless a
// CLAUDE.md imports it. Whether that loses anything, the reach check tells by comparing the texts.
const ignoredAgents = (instructions: readonly Instruction[]): string[] =>
  instructions
    .filter((agents) => agents.kind === "agents")
    .filter((agents) => instructions.some((file) => isClaudeFile(file) && isWithin(agents.dir, file.dir)))
    .filter((agents) => !instructions.some((file) => file.imports.includes(agents.path)))
    .map((agents) => agents.path);

export const discoverClaudeCode = async (project: Project): Promise<Inventory> => {
  // Each finder keeps its own problems, so their order doesn't depend on which read finishes first.
  const skillProblems: Problem[] = [];
  const mcpProblems: Problem[] = [];
  const [found, skills, commands, mcp] = await Promise.all([
    findInstructions(project),
    findSkills(project, skillProblems),
    findCommands(project),
    findMcp(project, mcpProblems),
  ]);
  const problems: Problem[] = [...skillProblems, ...listingProblems("claude-code", skills)];
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
    mcp,
    problems: [...found.problems, ...problems, ...mcpProblems],
    ignored: ignoredAgents(found.instructions),
  };
};
