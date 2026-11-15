import type { Bound, ListExpect, LoadoutExpect } from "#shared/contract/index.ts";
import { expect } from "./expect.ts";

// A list's expectations as the DSL's matchers: `include` is toInclude, `exclude` is .not.toInclude.
export const checkList = (actual: unknown, list: ListExpect | undefined) => {
  if (!list) return;
  if (list.include) expect(actual).toInclude(list.include);
  if (list.exclude) for (const id of list.exclude) expect(actual).not.toInclude(id);
  if (list.equal) expect(actual).toEqual(list.equal);
};

export const checkBound = (actual: number, bound: Bound | undefined) => {
  if (!bound) return;
  if (bound.lessThan !== undefined) expect(actual).toBeLessThan(bound.lessThan);
  if (bound.atMost !== undefined) expect(actual).toBeLessThanOrEqual(bound.atMost);
  if (bound.moreThan !== undefined) expect(actual).toBeGreaterThan(bound.moreThan);
  if (bound.atLeast !== undefined) expect(actual).toBeGreaterThanOrEqual(bound.atLeast);
};

type Viewed = {
  rules: unknown;
  skills: { listed: unknown; loaded: unknown };
  mcp: { servers: unknown };
  commands: unknown;
  tokens: { total?: number; known?: number; byComponent: Partial<Record<string, number>>; byMcpServer?: unknown };
};

// What a loadout of L3, L4, or L5 should hold.
export const checkLoadout = (loadout: Viewed, wanted: LoadoutExpect) => {
  checkList(loadout.rules, wanted.rules);
  checkList(loadout.skills.listed, wanted.skills?.listed);
  checkList(loadout.skills.loaded, wanted.skills?.loaded);
  checkList(loadout.mcp.servers, wanted.mcp?.servers);
  checkList(loadout.commands, wanted.commands);
  const { tokens } = loadout;
  checkBound(tokens.total ?? tokens.known ?? 0, wanted.tokens?.total);
  for (const [component, bound] of Object.entries(wanted.tokens?.byComponent ?? {})) {
    checkBound(tokens.byComponent[component] ?? 0, bound);
  }
  const byServer = tokens.byMcpServer as ((server: string) => number) | undefined;
  for (const [server, bound] of Object.entries(wanted.tokens?.byMcpServer ?? {})) {
    checkBound(byServer ? byServer(server) : 0, bound);
  }
  if (wanted.snapshot) expect(loadout).toMatchLoadoutSnapshot();
};
