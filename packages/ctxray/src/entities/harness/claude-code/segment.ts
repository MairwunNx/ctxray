import type { Exchange, Json } from "#shared/contract/index.ts";
import type { Segment } from "../capture/model.ts";
import {
  listing,
  type Marker,
  projectPath,
  reminders,
  type Section,
  slug,
  splitSections,
} from "../capture/sections.ts";

type Kind =
  | "instructions"
  | "file"
  | "skills"
  | "deferred"
  | "mcp"
  | "skillBody"
  | "context"
  | "agents"
  | "environment"
  | "model"
  | "date"
  | "attribution"
  | "budget"
  | "hook";

// Claude Code 2.1's phrases (ADR 0005). Order matters only where two could match the same line.
const MARKERS: Marker<Kind>[] = [
  { kind: "instructions", pattern: /^Codebase and user instructions are shown below/ },
  { kind: "file", pattern: /^Contents of (.+?)(?: \([^)]*\))?:$/ },
  { kind: "skills", pattern: /^The following skills are available for use with the Skill tool:/ },
  { kind: "deferred", pattern: /^The following deferred tools are now available via ToolSearch/ },
  { kind: "mcp", pattern: /^# MCP Server Instructions/ },
  { kind: "skillBody", pattern: /^Base directory for this skill: (.+)$/ },
  { kind: "context", pattern: /^As you answer the user's questions, you can use the following context:/ },
  { kind: "agents", pattern: /^Available agent types for the Agent tool:/ },
  { kind: "environment", pattern: /^# Environment$/ },
  { kind: "model", pattern: /^You are powered by the model/ },
  { kind: "date", pattern: /^Today's date is/ },
  { kind: "attribution", pattern: /^Attribution for git commits/ },
  { kind: "budget", pattern: /^<total_tokens>/ },
  { kind: "hook", pattern: /^\w+:\w+ hook (?:success|additional context):/ },
];

const system = (id: string, text: string): Segment => ({ component: "system", id, text });

const fromSection = (section: Section<Kind>, work: string, fallback: Segment["component"]): Segment[] => {
  const { kind, match, text } = section;
  switch (kind) {
    case "file":
      return [{ component: "rules", id: projectPath(work, match?.[1] ?? ""), text, evidence: "marker" }];
    case "skills":
      return listing(text).map(({ name, line }) => ({ component: "skills", id: name, text: line }));
    case "deferred":
      // One bare tool name per line after the header.
      return text
        .split("\n")
        .slice(1)
        .filter((line) => /^\S+$/.test(line))
        .map((name) => deferred(name, name));
    case "mcp":
      return text
        .split(/^## /m)
        .slice(1)
        .map((part) => ({ component: "mcp", id: part.split("\n")[0]?.trim() ?? "", text: `## ${part}` }));
    case "skillBody":
      return [{ component: "skills", id: `loaded:${projectPath(work, match?.[1] ?? "")}`, text }];
    case undefined:
      return text.trim() === "" ? [] : [{ component: fallback, id: fallback, text }];
    default:
      return [system(kind, text)];
  }
};

// The deferred list names tools without their schemas: `mcp__github__create_issue` is an MCP tool.
const deferred = (name: string, line: string): Segment => {
  const mcp = /^mcp__(.+?)__(.+)$/.exec(name);
  return mcp
    ? { component: "mcp", id: `${mcp[1]}/${mcp[2]}`, text: line, deferred: true }
    : { component: "tools", id: name, text: line, deferred: true };
};

type Text = { text: string; inResult: boolean };

const textsOf = (content: unknown): Text[] => {
  if (typeof content === "string") return [{ text: content, inResult: false }];
  if (!Array.isArray(content)) return [];
  return (content as Json[]).flatMap((block): Text[] => {
    if (block["type"] === "text") return [{ text: String(block["text"]), inResult: false }];
    if (block["type"] === "tool_result") {
      return textsOf(block["content"]).map((inner) => ({ ...inner, inResult: true }));
    }
    return [{ text: JSON.stringify(block), inResult: true }];
  });
};

const ofText = (text: string, work: string, fallback: Segment["component"]): Segment[] => {
  const { inside, outside } = reminders(text);
  return [
    ...inside.flatMap((body) => splitSections(body, MARKERS).flatMap((part) => fromSection(part, work, "system"))),
    ...splitSections(outside, MARKERS).flatMap((part) => fromSection(part, work, fallback)),
  ];
};

// One Anthropic Messages request of Claude Code, cut into the pieces of its loadout.
export const segmentClaudeCode = (request: Exchange, work: string): Segment[] => {
  const { body } = request;
  const blocks = Array.isArray(body["system"]) ? (body["system"] as Json[]) : [];
  const segments: Segment[] = blocks.flatMap((block, index) => {
    const text = String(block["text"] ?? "");
    if (text.startsWith("x-anthropic-billing-header:")) return [system("billing", text)];
    return text.split(/^(?=# )/m).map((part, at) => {
      const title = /^# (.+)$/m.exec(part)?.[1];
      return system(at === 0 || !title ? `prompt-${index}` : slug(title), part);
    });
  });
  for (const message of Array.isArray(body["messages"]) ? (body["messages"] as Json[]) : []) {
    const role = message["role"] === "system" ? "system" : "messages";
    for (const { text, inResult } of textsOf(message["content"])) {
      segments.push(...(inResult && !text.includes("<system-reminder>") ? [] : ofText(text, work, role)));
      if (inResult) segments.push({ component: "messages", id: "tool-result", text: reminders(text).outside });
    }
  }
  for (const tool of Array.isArray(body["tools"]) ? (body["tools"] as Json[]) : []) {
    const name = String(tool["name"]);
    const mcp = /^mcp__(.+?)__(.+)$/.exec(name);
    const text = JSON.stringify(tool);
    const isDeferred = tool["defer_loading"] === true;
    segments.push(
      mcp
        ? { component: "mcp", id: `${mcp[1]}/${mcp[2]}`, text, deferred: isDeferred }
        : { component: "tools", id: name, text, deferred: isDeferred },
    );
  }
  return segments;
};
