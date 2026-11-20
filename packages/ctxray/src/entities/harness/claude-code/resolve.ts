import type { Activation } from "#shared/contract/index.ts";
import { isCalibrated } from "#shared/tokens/index.ts";
import type { Instruction, Inventory } from "../inventory.ts";
import { CLAUDE_STATIC_CHARS, claudeListing, listedEntry } from "../listing.ts";
import { chainTo, isInside, isWithin, matchingGlob, parentDirs } from "../project.ts";
import {
  createRules,
  listingLine,
  type Scope,
  type StaticLoadout,
  tokenCounterOf,
  withTokens,
} from "../static-loadout.ts";
import { isClaudeFile } from "./discover.ts";

// Emulates Claude Code 2.1 (ADR 0005, code.claude.com/docs/en/memory): CLAUDE.md files from the root down to
// the cwd load at launch, files below the cwd load once the agent touches a file there.
export const resolveClaudeCode = (inventory: Inventory, { cwd, files }: Scope): StaticLoadout => {
  const { instructions } = inventory;
  const chain = chainTo(cwd);
  const below = [...new Set(files.flatMap(parentDirs))].filter((dir) => dir !== cwd && isInside(dir, cwd));
  const agentsMode = !instructions.some((file) => isClaudeFile(file) && chain.includes(file.dir));
  const counter = tokenCounterOf("claude-code");
  const { rules, add: addRule } = createRules(counter);

  // Claude Code 2.1.311 expands `@imports` only for files in the cwd and below it: a CLAUDE.md above the cwd
  // loads without its imports (verified on the wire, stage 9).
  const add = (
    instruction: Instruction,
    activation: Activation,
    reason: string,
    expands = isWithin(instruction.dir, cwd),
  ) => {
    addRule(instruction.path, activation, reason, instruction.text);
    if (!expands) return;
    for (const path of instruction.imports) {
      const imported = instructions.find((candidate) => candidate.path === path);
      if (imported) add(imported, activation, `import:${instruction.path}`, true);
    }
  };
  const at = (dir: string, kind: Instruction["kind"]) =>
    instructions.filter((file) => file.dir === dir && file.kind === kind && (kind !== "rule" || !file.globs));
  // One directory's files in Claude Code's order: CLAUDE.md, unconditional rules, CLAUDE.local.md.
  // AGENTS.md stands in where the directory has no CLAUDE.md of its own and the session reads AGENTS.md.
  const load = (dir: string, activation: Activation, reason: string) => {
    const own = [...at(dir, "memory"), ...at(dir, "local")];
    for (const file of at(dir, "memory")) add(file, activation, reason);
    if (agentsMode && own.length === 0) for (const file of at(dir, "agents")) add(file, activation, reason);
    for (const file of at(dir, "rule")) add(file, activation, activation === "always" ? "always" : reason);
    for (const file of at(dir, "local")) add(file, activation, reason);
  };

  for (const dir of chain) load(dir, "always", "cwd");
  for (const file of files) {
    for (const dir of parentDirs(file).filter((dir) => below.includes(dir))) load(dir, "path", `nested:${file}`);
  }
  const reachable = new Set(chain).union(new Set(below));
  for (const rule of instructions.filter((file) => file.globs && reachable.has(file.dir))) {
    const hit = files.map((file) => matchingGlob(rule.globs ?? [], rule.dir, file)).find((glob) => glob !== undefined);
    if (hit !== undefined) add(rule, "path", `glob:${hit}`);
  }

  // Skills with `paths` show up only for matching files, relative to the cwd.
  const skills = inventory.skills
    .filter((skill) => skill.listed && reachable.has(skill.dir))
    .filter((skill) => !skill.globs || files.some((file) => matchingGlob(skill.globs ?? [], cwd, file)))
    .map((skill) => ({ skill }));
  const listing = claudeListing(
    skills.map(({ skill }) => skill),
    CLAUDE_STATIC_CHARS,
  );
  const commands = inventory.commands
    .filter((command) => reachable.has(command.dir))
    .filter((command) => !inventory.skills.some((skill) => skill.name === command.name));

  return withTokens(
    {
      harness: "claude-code",
      cwd,
      rules,
      skills: {
        listed: skills.map(({ skill }, index) => listedEntry(skill, listing, index, counter.count)),
        loaded: [],
      },
      mcp: { servers: inventory.mcp.filter((server) => server.enabled).map(({ name }) => ({ name })), tools: [] },
      commands: commands.map(({ name, path }) => ({ name, path })),
    },
    commands.map((command) => listingLine(command.name, command.description)),
    isCalibrated("anthropic") ? {} : { calibration: "none" },
  );
};
