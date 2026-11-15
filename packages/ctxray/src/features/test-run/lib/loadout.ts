import { posix } from "node:path";
import { STATIC_ADAPTERS, type StaticLoadout } from "#entities/harness/index.ts";
import type { CommandEntry, Component, HarnessId, McpServer, RuleEntry, SkillEntry } from "#shared/contract/index.ts";
import { fail } from "./failure.ts";
import type { CellScope } from "./scope.ts";
import { attachSnapshot, snapshotOf } from "./snapshot.ts";

// Both relative to the project root: the suite's fixture, or the repository.
export type ResolveRequest = { cwd?: string; files?: readonly string[] };

// An array with lookup by path or name: `loadout.rules.get(".claude/rules/payments.md").reason`.
export type EntryList<T> = T[] & { get: (id: string) => T };

export type ResolvedLoadout = {
  harness: HarnessId;
  cwd: string;
  files: readonly string[];
  rules: EntryList<RuleEntry>;
  skills: { listed: EntryList<SkillEntry>; loaded: EntryList<SkillEntry> };
  mcp: { servers: EntryList<McpServer> };
  commands: EntryList<CommandEntry>;
  // Without a run nothing knows the system prompt, tools, or MCP schemas, so only these components count.
  tokens: { known: number; byComponent: Partial<Record<Component, number>>; exact: false; method: string };
};

type Entry = { path?: string | undefined; name?: string };

export const idOf = (entry: Entry): string => entry.path ?? entry.name ?? "";

export const entryList = <T extends Entry>(entries: readonly T[], what: string): EntryList<T> =>
  Object.assign([...entries], {
    get: (id: string) =>
      entries.find((entry) => entry.path === id || entry.name === id) ??
      fail("expect.noEntry", { id, what, present: entries.map(idOf).join(", ") || "—" }),
  });

const toView = (loadout: StaticLoadout, files: readonly string[]): ResolvedLoadout => {
  const view = {
    harness: loadout.harness,
    cwd: loadout.cwd,
    files,
    rules: entryList(loadout.rules, "rules"),
    skills: {
      listed: entryList(loadout.skills.listed, "skills.listed"),
      loaded: entryList(loadout.skills.loaded, "skills.loaded"),
    },
    mcp: { servers: entryList(loadout.mcp.servers, "mcp.servers") },
    commands: entryList(loadout.commands, "commands"),
    tokens: {
      known: Object.values(loadout.tokens.byComponent).reduce((total, tokens) => total + tokens, 0),
      byComponent: loadout.tokens.byComponent,
      exact: loadout.tokens.exact,
      method: loadout.tokens.method,
    },
  };
  return attachSnapshot(view, snapshotOf(loadout), "static");
};

const normal = (path: string) => {
  const clean = posix.normalize(path.replaceAll("\\", "/")).replace(/\/+$/, "");
  return clean === "." ? "" : clean;
};

// L3: what the harness would load for this cwd and these files, predicted from the project's files alone.
export const resolveIn =
  (scope: CellScope) =>
  async ({ cwd = "", files = [] }: ResolveRequest = {}): Promise<ResolvedLoadout> => {
    const adapter = STATIC_ADAPTERS[scope.harness] ?? fail("resolve.noAdapter", { harness: scope.harness });
    const dir = normal(cwd);
    const { project } = scope.workspace;
    if (dir.startsWith("..") || (dir !== "" && !project.dirs.includes(dir))) fail("resolve.noFolder", { dir: cwd });
    const paths = files.map(normal).filter((path) => !path.startsWith(".."));
    const loadout = adapter.resolve(scope.inventory, { cwd: dir, files: paths });
    for (const rule of loadout.rules) scope.seen.add(rule.path);
    for (const skill of [...loadout.skills.listed, ...loadout.skills.loaded]) scope.seen.add(skill.path);
    return toView(loadout, paths);
  };
