import type { Instruction, Inventory } from "../inventory.ts";
import { anchored, chainTo, isInside, isWithin, matchingGlob, parentDirs } from "../project.ts";
import {
  createRules,
  listingLine,
  type Scope,
  type StaticLoadout,
  tokenCounterOf,
  withTokens,
} from "../static-loadout.ts";

const always = (file: Instruction) =>
  file.kind !== "rule" || file.activation === "always" || file.activation === undefined;

// Emulates the Cursor CLI 2026.11 local build (ADR 0009). At launch: AGENTS.md, CLAUDE.md, CLAUDE.local.md, and
// `alwaysApply` rules from the root down to the cwd, .cursorrules, the descriptions of the rules the model
// fetches by them, and the cwd's skills. Once the agent reads a file, the same files and the skills of each
// folder below the cwd on the way, and every glob rule that matches it, join the read's result.
export const resolveCursor = (inventory: Inventory, { cwd, files }: Scope): StaticLoadout => {
  const chain = chainTo(cwd);
  const counter = tokenCounterOf("cursor-cli");
  const { rules, add } = createRules(counter);
  const at = (dir: string) => inventory.instructions.filter((file) => file.dir === dir);
  for (const dir of chain) for (const file of at(dir).filter(always)) add(file.path, "always", "cwd", file.text);
  // The model can fetch a described rule from anywhere in the workspace, not only from the folders on the way.
  const fetchable = (dir: string) => chain.includes(dir) || isWithin(dir, cwd);
  for (const file of inventory.instructions.filter((one) => one.activation === "intent" && fetchable(one.dir))) {
    add(file.path, "intent", "description", file.description ?? "");
  }
  const below = new Set<string>();
  for (const file of files.filter((one) => isInside(one, cwd))) {
    for (const dir of parentDirs(file).filter((one) => isInside(one, cwd))) {
      below.add(dir);
      for (const found of at(dir).filter(always)) add(found.path, "path", `nested:${file}`, found.text);
    }
  }
  const reachable = new Set([...chain, ...below]);
  for (const rule of inventory.instructions.filter((one) => one.activation === "path" && reachable.has(one.dir))) {
    const hit = (rule.globs ?? []).find((glob) =>
      files.some((file) => matchingGlob([anchored(glob)], rule.dir, file) !== undefined),
    );
    if (hit !== undefined) add(rule.path, "path", `glob:${hit}`, rule.text);
  }
  // Skills of the cwd show at launch, the ones of a folder below it once the agent reads a file there.
  const skills = inventory.skills.filter((skill) => skill.listed && (skill.dir === cwd || below.has(skill.dir)));
  return withTokens(
    {
      harness: "cursor-cli",
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
          .filter((server) => chain.some((dir) => server.path === `${dir === "" ? "" : `${dir}/`}.cursor/mcp.json`))
          .map(({ name }) => ({ name })),
        tools: [],
      },
      // Commands are the editor's: nothing of them reaches the model in a headless run.
      commands: inventory.commands
        .filter((command) => chain.includes(command.dir))
        .map(({ name, path }) => ({ name, path })),
    },
    [],
  );
};
