import type { Component, LoadoutPieces, LoadoutSnapshot } from "#shared/contract/index.ts";

export type LoadoutChange = {
  component: Component;
  id: string; // a section's title, a rule's path, a skill's name, `server/tool`, a command's name
  before: number | undefined; // tokens, undefined when it wasn't there
  after: number | undefined; // tokens, undefined when it's gone
};

export type LoadoutDiff = {
  total: { before: number; after: number };
  byComponent: Partial<Record<Component, { before: number; after: number }>>;
  changes: LoadoutChange[]; // added, removed, or a different size, by component
};

export const piecesOfSnapshot = (loadout: LoadoutSnapshot): LoadoutPieces => ({
  total: loadout.tokens.total,
  byComponent: loadout.tokens.byComponent,
  items: itemsOf(loadout),
});

const itemsOf = (loadout: LoadoutSnapshot): LoadoutPieces["items"] => ({
  system: loadout.system.map((section) => ({ id: section.title ?? section.id, tokens: section.tokens })),
  rules: loadout.rules.map((rule) => ({ id: rule.path, tokens: rule.tokens })),
  skills: loadout.skills.listed.map((skill) => ({ id: skill.name, tokens: skill.tokens })),
  mcp: loadout.mcp.tools.map((tool) => ({ id: `${tool.server}/${tool.name}`, tokens: tool.tokens })),
  commands: loadout.commands.map((command) => ({ id: command.name, tokens: 0 })),
  tools: [], // built-in tools come as one block: only their total moves
});

const COMPONENTS: readonly Component[] = ["system", "tools", "rules", "skills", "mcp", "commands"];

// What changed between two loadouts of one project, like two versions of a harness: every piece that came,
// went, or grew or shrank, and the tokens of each component.
export const diffLoadouts = (before: LoadoutSnapshot, after: LoadoutSnapshot): LoadoutDiff =>
  diffPieces(piecesOfSnapshot(before), piecesOfSnapshot(after));

// The same for any two loadouts as pieces: two captured requests, or what L3 predicts on two revisions.
export const diffPieces = (before: LoadoutPieces, after: LoadoutPieces): LoadoutDiff => {
  const old = before.items;
  const next = after.items;
  const changes: LoadoutChange[] = [];
  const byComponent: LoadoutDiff["byComponent"] = {};
  for (const component of COMPONENTS) {
    const was = new Map(old[component].map((item) => [item.id, item.tokens]));
    const is = new Map(next[component].map((item) => [item.id, item.tokens]));
    for (const id of new Set([...was.keys(), ...is.keys()])) {
      if (was.get(id) !== is.get(id)) changes.push({ component, id, before: was.get(id), after: is.get(id) });
    }
    const tokens = { before: before.byComponent[component] ?? 0, after: after.byComponent[component] ?? 0 };
    if (tokens.before !== 0 || tokens.after !== 0) byComponent[component] = tokens;
  }
  return { total: { before: before.total, after: after.total }, byComponent, changes };
};
