import type { StaticLoadout } from "#entities/harness/index.ts";
import type {
  CommandEntry,
  Component,
  Exchange,
  HarnessId,
  LoadoutSnapshot,
  McpServer,
  McpTool,
  RuleEntry,
  SkillEntry,
  SystemSection,
} from "#shared/contract/index.ts";
import { fail } from "./failure.ts";
import { type EntryList, entryList } from "./loadout.ts";
import { attachSnapshot } from "./snapshot.ts";

// What a harness really sent on one request (L4, L5), with lookups like the L3 view.
export type CapturedLoadout = {
  harness: HarnessId;
  version: string;
  model: string | undefined;
  system: EntryList<SystemSection & { name: string }>;
  rules: EntryList<RuleEntry>;
  skills: { listed: EntryList<SkillEntry>; loaded: EntryList<SkillEntry> };
  mcp: { servers: EntryList<McpServer>; tools: EntryList<McpTool> };
  commands: EntryList<CommandEntry>;
  duplicates: readonly { path: string; sameAs?: string | undefined }[];
  tokens: {
    total: number;
    byComponent: Partial<Record<Component, number>>;
    byMcpServer: (server: string) => number; // its schemas and instructions, as they load
    exact: boolean; // true only when the provider counted them
    method: string;
    framing: number | undefined; // exact counts: what no component owns
  };
};

// One request of a session: its loadout, what this request added to the one before, and what ctxray's L3
// resolver predicts for the same cwd and files.
export type CapturedRequest = {
  kind: "request";
  index: number;
  loadout: CapturedLoadout;
  added: { rules: readonly string[]; skills: readonly string[] };
  predicted: StaticLoadout;
  raw: Exchange;
  snapshot: LoadoutSnapshot; // the loadout as the contract has it, for a diff between two runs
};

// Names only: tokens move with the date, the paths, and git status in the payload, the names don't.
const snapshotOfCapture = (loadout: LoadoutSnapshot) => ({
  system: loadout.system.map((section) => section.id),
  rules: Object.fromEntries(loadout.rules.map(({ path, activation, reason }) => [path, { activation, reason }])),
  skills: Object.fromEntries(
    loadout.skills.listed.map(({ name, path, builtin }) => [name, builtin ? "builtin" : path]),
  ),
  loaded: loadout.skills.loaded.map(({ name }) => name),
  mcp: Object.fromEntries(
    loadout.mcp.servers.map(({ name }) => [
      name,
      loadout.mcp.tools.filter((tool) => tool.server === name).map((tool) => tool.name),
    ]),
  ),
  commands: loadout.commands.map(({ name }) => name),
});

// ctxray's own plugin stays out of what a test sees, the way it stays out of the totals.
const notOwn = <T extends { own?: boolean | undefined }>(entries: readonly T[]) => entries.filter((one) => !one.own);

const withoutOwn = (loadout: LoadoutSnapshot): LoadoutSnapshot => ({
  ...loadout,
  skills: { listed: notOwn(loadout.skills.listed), loaded: notOwn(loadout.skills.loaded) },
  mcp: { servers: notOwn(loadout.mcp.servers), tools: notOwn(loadout.mcp.tools) },
  commands: notOwn(loadout.commands),
});

export const toCaptured = (full: LoadoutSnapshot): CapturedLoadout => {
  const loadout = withoutOwn(full);
  const byMcpServer = (server: string) =>
    loadout.tokens.byMcpServer[server] ??
    fail("expect.noEntry", {
      id: server,
      what: "mcp.servers",
      present: Object.keys(loadout.tokens.byMcpServer).join(", ") || "—",
    });
  const view: CapturedLoadout = {
    harness: loadout.harness.name,
    version: loadout.harness.version,
    model: loadout.harness.model,
    system: entryList(
      loadout.system.map((section) => ({ ...section, name: section.id })),
      "system",
    ),
    rules: entryList(loadout.rules, "rules"),
    skills: {
      listed: entryList(loadout.skills.listed, "skills.listed"),
      loaded: entryList(loadout.skills.loaded, "skills.loaded"),
    },
    mcp: {
      servers: entryList(loadout.mcp.servers, "mcp.servers"),
      tools: entryList(
        loadout.mcp.tools.map((tool) => ({ ...tool, path: `${tool.server}/${tool.name}` })),
        "mcp.tools",
      ),
    },
    commands: entryList(loadout.commands, "commands"),
    duplicates: loadout.duplicates ?? [],
    tokens: {
      total: loadout.tokens.total,
      byComponent: loadout.tokens.byComponent,
      byMcpServer,
      exact: loadout.tokens.exact,
      method: loadout.tokens.method,
      framing: loadout.tokens.framing,
    },
  };
  const variant = [loadout.harness.version, loadout.harness.model].filter(Boolean).join(" ");
  return attachSnapshot(view, snapshotOfCapture(loadout), variant);
};

export const isRequest = (value: unknown): value is CapturedRequest =>
  typeof value === "object" && value !== null && (value as { kind?: unknown }).kind === "request";
