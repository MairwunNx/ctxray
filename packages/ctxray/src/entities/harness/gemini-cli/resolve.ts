import type { Instruction, Inventory } from "../inventory.ts";
import { chainTo, isInside, joinPath, parentDirs } from "../project.ts";
import {
  createRules,
  listingLine,
  type Scope,
  type StaticLoadout,
  tokenCounterOf,
  withTokens,
} from "../static-loadout.ts";
import { DEFAULT_CONTEXT_FILE } from "./discover.ts";

// Emulates Gemini CLI 0.68 (ADR 0007): context files from the git root down to the cwd load at launch, sorted
// by path. Once a tool touches a file below the cwd, the context files between the cwd and that file join the
// tool's result. Settings, skills, and commands come only from the cwd's own `.gemini/` and `.agents/`.
export const resolveGeminiCli = (inventory: Inventory, { cwd, files }: Scope): StaticLoadout => {
  const names = [DEFAULT_CONTEXT_FILE, ...(inventory.contextFiles?.[cwd] ?? [])];
  const counter = tokenCounterOf("gemini-cli");
  const { rules, add: addRule } = createRules(counter);
  const byPath = new Map(inventory.instructions.map((file) => [file.path, file]));
  const add = (instruction: Instruction, activation: "always" | "path", reason: string) => {
    addRule(instruction.path, activation, reason, instruction.text);
    for (const path of instruction.imports) {
      const imported = byPath.get(path);
      if (imported) add(imported, activation, `import:${instruction.path}`);
    }
  };
  const contextIn = (dirs: readonly string[]): Instruction[] =>
    dirs
      .flatMap((dir) => names.flatMap((name) => byPath.get(joinPath(dir, name)) ?? []))
      .filter((file) => file.kind !== "import")
      .sort((a, b) => (a.path < b.path ? -1 : 1));

  for (const file of contextIn(chainTo(cwd))) add(file, "always", "cwd");
  for (const file of files.filter((one) => isInside(one, cwd))) {
    const below = parentDirs(file).filter((dir) => isInside(dir, cwd));
    for (const found of contextIn(below)) add(found, "path", `nested:${file}`);
  }

  const settings = joinPath(cwd, ".gemini/settings.json");
  const skills = inventory.skills.filter((skill) => skill.listed && skill.dir === cwd);
  return withTokens(
    {
      harness: "gemini-cli",
      cwd,
      rules,
      skills: {
        listed: skills.map((skill) => ({
          name: skill.name,
          path: skill.path,
          tokens: counter.count(listingLine(skill.name, skill.description)),
        })),
        loaded: [],
      },
      mcp: {
        servers: inventory.mcp
          .filter((server) => server.enabled && server.path === settings)
          .map(({ name }) => ({ name })),
        tools: [],
      },
      // Commands expand on the client: their text reaches the model as the prompt, never as a listing.
      commands: inventory.commands.filter((command) => command.dir === cwd).map(({ name, path }) => ({ name, path })),
    },
    [],
    {},
    counter,
  );
};
