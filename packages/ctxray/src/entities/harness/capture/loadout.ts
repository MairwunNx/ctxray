import { posix } from "node:path";
import type {
  CommandEntry,
  Component,
  HarnessInfo,
  LoadoutSnapshot,
  McpServer,
  McpTool,
  Provenance,
  RuleEntry,
  SkillEntry,
  SystemSection,
} from "#shared/contract/index.ts";
import { LOADOUT_SCHEMA_VERSION } from "#shared/contract/index.ts";
import type { ServerRecord } from "#shared/mcp-shim/index.ts";
import { countTokens, LOCAL_METHOD } from "#shared/tokens/index.ts";
import type { Inventory } from "../inventory.ts";
import type { StaticLoadout } from "../static-loadout.ts";
import { normalise, withoutCanaries } from "./canary.ts";
import type { Segment } from "./model.ts";
import { projectPath } from "./sections.ts";

export type LoadoutInput = {
  harness: HarnessInfo;
  segments: readonly Segment[];
  inventory: Inventory;
  predicted: StaticLoadout; // L3 for the same cwd and files: it names why each rule loads
  servers: Readonly<Record<string, ServerRecord>>;
  work: string;
  first: boolean; // the session's first request: rules there load at start, later ones on the way
  aliases?: Readonly<Record<string, readonly string[]>>; // a canary's other paths, through symlinks
};

// A canary names one path of a symlinked file. The harness loaded it under the path L3 expects, if any.
const pathOf = (segment: Segment, input: LoadoutInput) => {
  const candidates = [segment.id, ...(input.aliases?.[segment.id] ?? [])];
  return candidates.find((path) => input.predicted.rules.some((rule) => rule.path === path)) ?? segment.id;
};

const tokensOf = (segment: Segment) => countTokens(withoutCanaries(segment.text));

// Enough text that a file starting with it is that file, not a coincidence.
const PREFIX = 200;

// A chunk without a canary or marker still counts when it holds a whole file of the project, or the start
// of one: Codex cuts the file that crosses its byte budget, and the canary at its end with it.
const fingerprinted = (segment: Segment, inventory: Inventory): Segment[] => {
  const text = normalise(segment.text);
  const whole = inventory.instructions.filter(
    (file) => normalise(file.text) !== "" && text.includes(normalise(file.text)),
  );
  const cut =
    whole.length === 0 && text.length >= PREFIX
      ? inventory.instructions.filter((file) => normalise(file.text).startsWith(text))
      : [];
  return [...whole, ...cut].map((file) => ({ ...segment, id: file.path, evidence: "fingerprint" }));
};

const rulesOf = (input: LoadoutInput, provenance: Record<string, Provenance>): RuleEntry[] => {
  const rules: RuleEntry[] = [];
  const segments = input.segments.filter((segment) => segment.component === "rules");
  for (const found of segments.flatMap((one) => (one.id === "" ? fingerprinted(one, input.inventory) : [one]))) {
    const segment = found.evidence === "canary" ? { ...found, id: pathOf(found, input) } : found;
    if (rules.some((rule) => rule.path === segment.id)) continue;
    const predicted = input.predicted.rules.find((rule) => rule.path === segment.id);
    const activation = predicted?.activation ?? (input.first ? "always" : "path");
    const reason = predicted?.reason ?? "observed";
    rules.push({ path: segment.id, activation, reason, tokens: tokensOf(segment) });
    provenance[`rule:${segment.id}`] = { source: segment.id, reason, evidence: segment.evidence ?? "marker" };
  }
  return rules;
};

const skillsOf = (input: LoadoutInput) => {
  const { inventory, segments, work } = input;
  const sourceOf = (segment: Segment) => (segment.source ? projectPath(work, segment.source) : undefined);
  const isCommand = (name: string) =>
    inventory.commands.some((command) => command.name === name) &&
    !inventory.skills.some((skill) => skill.name === name);
  const listed: SkillEntry[] = [];
  const loaded: SkillEntry[] = [];
  const commands: CommandEntry[] = [];
  for (const segment of segments.filter((one) => one.component === "skills")) {
    const id = segment.id.replace(/^loaded:/, "");
    const skill = inventory.skills.find(
      (one) => one.path === sourceOf(segment) || posix.dirname(one.path) === id || (!segment.source && one.name === id),
    );
    if (segment.id.startsWith("loaded:")) {
      loaded.push({ name: skill?.name ?? posix.basename(id), path: skill?.path ?? id, tokens: tokensOf(segment) });
    } else if (isCommand(id)) {
      commands.push({ name: id, path: inventory.commands.find((command) => command.name === id)?.path });
    } else {
      // A skill the project doesn't hold ships with the harness, like Codex's `.system` ones.
      const path = skill?.path ?? "";
      const builtin = skill === undefined;
      listed.push({ name: id, path, ...(builtin && { builtin }), tokens: tokensOf(segment) });
    }
  }
  return { listed, loaded, commands };
};

const mcpOf = (input: LoadoutInput) => {
  const wire = input.segments.filter((segment) => segment.component === "mcp");
  const names = new Set([...wire.map((segment) => segment.id.split("/")[0] as string), ...Object.keys(input.servers)]);
  const servers: McpServer[] = [...names].sort().map((name) => {
    const version = input.servers[name]?.info?.version;
    return version ? { name, version } : { name };
  });
  const tools: McpTool[] = [];
  const byMcpServer: Record<string, number> = {};
  for (const { name } of servers) {
    const record = input.servers[name];
    const inline = (tool: string) => wire.some((segment) => segment.id === `${name}/${tool}` && !segment.deferred);
    const schemas = record?.tools ?? [];
    for (const schema of schemas) {
      tools.push({
        server: name,
        name: schema.name,
        deferred: !inline(schema.name),
        tokens: countTokens(JSON.stringify(schema)),
      });
    }
    for (const segment of wire.filter((one) => one.id.startsWith(`${name}/`))) {
      const tool = segment.id.slice(name.length + 1);
      if (!tools.some((known) => known.server === name && known.name === tool)) {
        tools.push({ server: name, name: tool, deferred: segment.deferred === true, tokens: tokensOf(segment) });
      }
    }
    const instructions = record?.instructions ? countTokens(record.instructions) : 0;
    byMcpServer[name] = tools
      .filter((tool) => tool.server === name)
      .reduce((sum, tool) => sum + tool.tokens, instructions);
  }
  return { servers, tools, byMcpServer };
};

const systemOf = (segments: readonly Segment[]): SystemSection[] => {
  const sections: SystemSection[] = [];
  for (const segment of segments.filter((one) => one.component === "system")) {
    const taken = sections.filter((section) => section.id === segment.id || section.id.startsWith(`${segment.id}#`));
    const id = taken.length === 0 ? segment.id : `${segment.id}#${taken.length + 1}`;
    sections.push({ id, tokens: tokensOf(segment) });
  }
  return sections;
};

// What the harness really sent, as a Loadout: the segments of one request, tied to the project's files.
export const buildLoadout = (input: LoadoutInput): LoadoutSnapshot => {
  const provenance: Record<string, Provenance> = {};
  const rules = rulesOf(input, provenance);
  const { listed, loaded, commands } = skillsOf(input);
  const mcp = mcpOf(input);
  const byComponent: Partial<Record<Component, number>> = {};
  let total = 0;
  for (const segment of input.segments) {
    const tokens = tokensOf(segment);
    total += tokens;
    if (segment.component !== "messages")
      byComponent[segment.component] = (byComponent[segment.component] ?? 0) + tokens;
  }
  return {
    schemaVersion: LOADOUT_SCHEMA_VERSION,
    harness: input.harness,
    mode: "capture",
    system: systemOf(input.segments),
    rules,
    skills: { listed, loaded },
    mcp: { servers: mcp.servers, tools: mcp.tools },
    commands,
    tokens: { total, byComponent, byMcpServer: mcp.byMcpServer, exact: false, method: LOCAL_METHOD },
    provenance,
  };
};
