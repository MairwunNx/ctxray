import { posix } from "node:path";
import type {
  CommandEntry,
  Component,
  HarnessInfo,
  LoadoutSnapshot,
  Provenance,
  RuleEntry,
  SkillEntry,
  SystemSection,
} from "#shared/contract/index.ts";
import { LOADOUT_SCHEMA_VERSION } from "#shared/contract/index.ts";
import type { ServerRecord } from "#shared/mcp-shim/index.ts";
import type { TokenCounter } from "#shared/tokens/index.ts";
import type { Inventory } from "../inventory.ts";
import { type StaticLoadout, tokenCounterOf } from "../static-loadout.ts";
import { normalise, withoutCanaries } from "./canary.ts";
import { mcpOf } from "./loadout-mcp.ts";
import type { Segment } from "./model.ts";
import { isOwnSegment, isOwnSkill } from "./own.ts";
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
  own?: readonly string[]; // where ctxray's own plugin lives, for the skill bodies it loads
};

// A canary names one path of a symlinked file. The harness loaded it under the path L3 expects, if any.
const pathOf = (segment: Segment, input: LoadoutInput) => {
  const candidates = [segment.id, ...(input.aliases?.[segment.id] ?? [])];
  return candidates.find((path) => input.predicted.rules.some((rule) => rule.path === path)) ?? segment.id;
};

// The harness's tokenizer: Gemma's vocabulary for Gemini CLI, o200k for the rest (ADR 0012).
export type Count = TokenCounter["count"];
const tokensOf = (segment: Segment, count: Count) => count(withoutCanaries(segment.text));

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

// The lines a harness wraps a file in: Claude Code's header, Gemini CLI's frame, OpenCode's header.
const FRAME = /^(?:Contents of .*|--- (?:End of )?Context from: .* ---|Instructions from: .*)$/gm;

type Duplicate = { path: string; sameAs?: string };

// A file reaches the model twice when the harness sends it twice, or sends two files with the same text.
const rulesOf = (
  input: LoadoutInput,
  provenance: Record<string, Provenance>,
  duplicates: Duplicate[],
  count: Count,
): RuleEntry[] => {
  const rules: RuleEntry[] = [];
  const texts = new Map<string, string>();
  const segments = input.segments.filter((segment) => segment.component === "rules");
  for (const found of segments.flatMap((one) => (one.id === "" ? fingerprinted(one, input.inventory) : [one]))) {
    const segment = found.evidence === "canary" ? { ...found, id: pathOf(found, input) } : found;
    if (rules.some((rule) => rule.path === segment.id)) {
      duplicates.push({ path: segment.id });
      continue;
    }
    // The text the file adds: without the harness's frame and without `@imports`, which load files of their own.
    const text = normalise(segment.text.replace(FRAME, "").replace(/^@\S+\s*$/gm, ""));
    const twin = texts.get(text);
    if (twin !== undefined && text !== "") duplicates.push({ path: segment.id, sameAs: twin });
    texts.set(text, segment.id);
    const predicted = input.predicted.rules.find((rule) => rule.path === segment.id);
    const activation = predicted?.activation ?? (input.first ? "always" : "path");
    const reason = predicted?.reason ?? "observed";
    rules.push({ path: segment.id, activation, reason, tokens: tokensOf(segment, count) });
    provenance[`rule:${segment.id}`] = { source: segment.id, reason, evidence: segment.evidence ?? "marker" };
  }
  return rules;
};

const skillsOf = (input: LoadoutInput, count: Count) => {
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
      loaded.push({
        name: skill?.name ?? posix.basename(id),
        path: skill?.path ?? id,
        ...(isOwnSegment(segment, input.own ?? []) && { own: true }),
        tokens: tokensOf(segment, count),
      });
    } else if (isCommand(id)) {
      commands.push({ name: id, path: inventory.commands.find((command) => command.name === id)?.path });
    } else {
      // A skill the project doesn't hold ships with the harness, like Codex's `.system` ones. Two skills of one
      // name in one folder, like `.claude/skills` and `.agents/skills`: OpenCode takes either, the snapshot L3's.
      const twin = input.predicted.skills.listed.find((one) => one.name === id);
      const same = twin && inventory.skills.find((one) => one.path === twin.path)?.dir === skill?.dir;
      const path = (same ? twin?.path : skill?.path) ?? "";
      const builtin = skill === undefined;
      const own = isOwnSkill(id);
      listed.push({
        name: id,
        path,
        ...(builtin && { builtin }),
        ...(own && { own }),
        tokens: tokensOf(segment, count),
      });
    }
  }
  return { listed, loaded, commands };
};

const systemOf = (segments: readonly Segment[], count: Count): SystemSection[] => {
  const sections: SystemSection[] = [];
  for (const segment of segments.filter((one) => one.component === "system")) {
    const taken = sections.filter((section) => section.id === segment.id || section.id.startsWith(`${segment.id}#`));
    const id = taken.length === 0 ? segment.id : `${segment.id}#${taken.length + 1}`;
    sections.push({ id, tokens: tokensOf(segment, count) });
  }
  return sections;
};

// What the harness really sent, as a Loadout: the segments of one request, tied to the project's files.
export const buildLoadout = (input: LoadoutInput): LoadoutSnapshot => {
  const counter = tokenCounterOf(input.harness.name);
  const { count } = counter;
  const provenance: Record<string, Provenance> = {};
  const duplicates: Duplicate[] = [];
  const rules = rulesOf(input, provenance, duplicates, count);
  const { listed, loaded, commands } = skillsOf(input, count);
  const mcp = mcpOf(input, count);
  const byComponent: Partial<Record<Component, number>> = {};
  let total = 0;
  let own = 0;
  for (const segment of input.segments) {
    const tokens = tokensOf(segment, count);
    if (isOwnSegment(segment, input.own ?? [])) {
      own += tokens;
      continue;
    }
    total += tokens;
    if (segment.component !== "messages")
      byComponent[segment.component] = (byComponent[segment.component] ?? 0) + tokens;
  }
  return {
    schemaVersion: LOADOUT_SCHEMA_VERSION,
    harness: input.harness,
    mode: "capture",
    system: systemOf(input.segments, count),
    rules,
    skills: { listed, loaded },
    mcp: { servers: mcp.servers, tools: mcp.tools },
    commands,
    tokens: {
      total,
      byComponent,
      byMcpServer: mcp.byMcpServer,
      exact: false,
      method: counter.method,
      ...(own > 0 && { own }),
    },
    provenance,
    ...(duplicates.length > 0 && { duplicates }),
  };
};
