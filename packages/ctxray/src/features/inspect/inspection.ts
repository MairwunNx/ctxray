import type { Inventory, Problem, Scope, StaticLoadout } from "#entities/harness/index.ts";
import type { Component, HarnessInspection, Provenance } from "#shared/contract/index.ts";

// The contract's shape, with problems still as catalog keys: the command words them in the user's language.
export type InspectedHarness = Omit<HarnessInspection, "problems"> & { problems: Problem[] };

const fromFile = (source: string, reason: string): Provenance => ({ source, reason, evidence: "static" });

// The folder an MCP config speaks for: `app/.gemini/settings.json` belongs to `app`, `.mcp.json` to the root.
const ownerOf = (path: string) => {
  const parts = path.split("/").slice(0, -1);
  if (parts.at(-1)?.startsWith(".")) parts.pop();
  return parts.join("/");
};
const isAtOrAbove = (dir: string, cwd: string) => dir === "" || cwd === dir || cwd.startsWith(`${dir}/`);

// Two configs may declare a server of the same name: the one nearest the start folder is the one in effect.
const configOf = (inventory: Inventory, name: string, cwd: string) =>
  inventory.mcp
    .filter((server) => server.name === name && server.enabled && isAtOrAbove(ownerOf(server.path), cwd))
    .sort((a, b) => ownerOf(b.path).length - ownerOf(a.path).length)[0] ??
  inventory.mcp.find((server) => server.name === name && server.enabled);

const provenanceOf = (loadout: StaticLoadout, inventory: Inventory, cwd: string): Record<string, Provenance> => {
  const entries: [string, Provenance][] = [
    ...loadout.rules.map(({ path, reason }): [string, Provenance] => [`rule:${path}`, fromFile(path, reason)]),
    ...loadout.skills.listed.map(({ name, path }): [string, Provenance] => [`skill:${name}`, fromFile(path, "listed")]),
    ...loadout.commands.flatMap(({ name, path }): [string, Provenance][] =>
      path === undefined ? [] : [[`command:${name}`, fromFile(path, "listed")]],
    ),
    ...loadout.mcp.servers.flatMap(({ name }): [string, Provenance][] => {
      const declared = configOf(inventory, name, cwd);
      return declared ? [[`mcp:${name}`, fromFile(declared.path, "configured")]] : [];
    }),
  ];
  return Object.fromEntries(entries);
};

// Files tell nothing about the system prompt, the built-in tools, or what MCP tools look like.
const unknownOf = (loadout: StaticLoadout): Component[] => [
  "system",
  "tools",
  ...(loadout.mcp.servers.length > 0 ? (["mcp"] as const) : []),
];

export const toInspection = (
  loadout: StaticLoadout,
  inventory: Inventory,
  scope: Scope,
  problems: Problem[],
): InspectedHarness => {
  const { byComponent, exact, method, calibration } = loadout.tokens;
  return {
    harness: loadout.harness,
    mode: "static",
    cwd: scope.cwd,
    files: [...scope.files],
    rules: loadout.rules,
    skills: loadout.skills,
    mcp: { servers: loadout.mcp.servers },
    commands: loadout.commands,
    tokens: {
      known: Object.values(byComponent).reduce((total, tokens) => total + tokens, 0),
      byComponent,
      unknown: unknownOf(loadout),
      exact,
      method,
      ...(calibration ? { calibration } : {}),
    },
    provenance: provenanceOf(loadout, inventory, scope.cwd),
    problems,
  };
};
