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
import { CONTEXT_NAMES } from "./discover.ts";

// Emulates OpenCode 1.19 (ADR 0008). At launch: the first of AGENTS.md, CLAUDE.md, CONTEXT.md that exists
// anywhere between the cwd and the git root, every file of that name on the way, then the `instructions`
// files of the configs on that way. Once a tool reads a file below the cwd, each folder between them adds the
// first context file it holds to the tool's result.
export const resolveOpencode = (inventory: Inventory, { cwd, files }: Scope): StaticLoadout => {
  const chain = chainTo(cwd);
  const upward = chain.toReversed();
  const counter = tokenCounterOf("opencode");
  const { rules, add } = createRules(counter);
  const byPath = new Map(
    inventory.instructions.filter((file) => file.kind !== "rule").map((file) => [file.path, file]),
  );
  const contextIn = (dir: string) => CONTEXT_NAMES.map((name) => byPath.get(joinPath(dir, name)));

  const first = CONTEXT_NAMES.find((name) => upward.some((dir) => byPath.has(joinPath(dir, name))));
  for (const dir of first ? upward : []) {
    const file = byPath.get(joinPath(dir, first ?? ""));
    if (file) add(file.path, "always", "cwd", file.text);
  }
  const patterns = chain.flatMap((dir) => inventory.instructionGlobs?.[dir] ?? []).map((one) => new Bun.Glob(one));
  for (const dir of upward) {
    for (const rule of inventory.instructions.filter((file) => file.kind === "rule" && file.dir === dir)) {
      const relative = dir === "" ? rule.path : rule.path.slice(dir.length + 1);
      const glob = patterns.find((one) => one.match(relative));
      if (glob) add(rule.path, "always", "config", rule.text);
    }
  }
  for (const file of files.filter((one) => isInside(one, cwd))) {
    const below = parentDirs(file)
      .filter((dir) => isInside(dir, cwd))
      .toReversed();
    for (const dir of below) {
      const found = contextIn(dir).find((one): one is Instruction => one !== undefined);
      if (found) add(found.path, "path", `nested:${file}`, found.text);
    }
  }

  // Skills from the cwd up to the root: a deeper one hides a skill of the same name above it.
  const skills = new Map(
    inventory.skills.filter((skill) => skill.listed && chain.includes(skill.dir)).map((skill) => [skill.name, skill]),
  );
  const configs = new Set(chain);
  const servers = new Map(
    inventory.mcp
      .filter((server) => configs.has(configDir(server.path)))
      .map((server) => [server.name, server.enabled] as const),
  );
  return withTokens(
    {
      harness: "opencode",
      cwd,
      rules,
      skills: {
        listed: [...skills.values()].map((skill) => ({
          name: skill.name,
          path: skill.path,
          tokens: counter.count(listingLine(skill.name, skill.description)),
        })),
        loaded: [],
      },
      mcp: { servers: [...servers].filter(([, enabled]) => enabled).map(([name]) => ({ name })), tools: [] },
      // Commands expand on the client: the model gets their text as the prompt, never a listing.
      commands: inventory.commands
        .filter((command) => configs.has(command.dir))
        .map(({ name, path }) => ({ name, path })),
    },
    [],
  );
};

// `app/.opencode/opencode.json` and `app/opencode.json` both belong to `app`.
const configDir = (path: string) => path.replace(/(^|\/)(\.opencode\/)?opencode\.jsonc?$/, "");
