import type { Exchange, Json } from "#shared/contract/index.ts";
import { canariesIn } from "../capture/canary.ts";
import type { Segment } from "../capture/model.ts";
import { listing, projectPath, slug } from "../capture/sections.ts";

const TAG = /^<([a-z_ ]+?)>/;

// `- name: description (file: r1/refunds/SKILL.md)` lines, with the roots table that names each `rN`.
const skillsOf = (text: string): Segment[] => {
  const roots = new Map([...text.matchAll(/^- `(r\d+)` = `(.+)`$/gm)].map((match) => [match[1], match[2]]));
  const start = text.indexOf("### Available skills");
  const end = text.indexOf("\n### ", start + 1);
  const listed = start === -1 ? "" : text.slice(start, end === -1 ? undefined : end);
  return [
    { component: "system", id: "skills-instructions", text: text.replace(listed, "") },
    ...listing(listed).map(({ name, line }) => {
      const file = /\(file: (r\d+)\/(.+)\)$/.exec(line);
      const path = file ? `${roots.get(file[1] as string)}/${file[2]}` : undefined;
      return { component: "skills" as const, id: name, text: line, ...(path && { source: path }) };
    }),
  ];
};

// `<tools>` names deferred namespaces: `mcp__github` is an MCP server whose schemas wait for tool_search.
const namespacesOf = (text: string): Segment[] =>
  listing(text).map(({ name, line }) => {
    const mcp = /^mcp__(.+)$/.exec(name);
    return mcp
      ? { component: "mcp", id: mcp[1] as string, text: line, deferred: true }
      : { component: "tools", id: name, text: line, deferred: true };
  });

// The AGENTS.md chain joins files with blank lines and no marker of its own: canaries tell them apart.
const instructionsOf = (text: string): Segment[] => {
  const body = /<INSTRUCTIONS>\n?([\s\S]*?)<\/INSTRUCTIONS>/.exec(text)?.[1] ?? "";
  const segments: Segment[] = [{ component: "system", id: "agents-md-header", text: text.replace(body, "") }];
  let rest = body;
  for (const path of canariesIn(body)) {
    const end = rest.indexOf(`⟦ctx:${path}⟧`) + `⟦ctx:${path}⟧`.length;
    segments.push({ component: "rules", id: path, text: rest.slice(0, end), evidence: "canary" });
    rest = rest.slice(end);
  }
  if (rest.trim() !== "") segments.push({ component: "rules", id: "", text: rest });
  return segments;
};

const partOf = (text: string, role: string, first: boolean): Segment[] => {
  const tag = TAG.exec(text)?.[1];
  if (tag === "skills_instructions") return skillsOf(text);
  if (tag === "tools") return namespacesOf(text);
  if (text.startsWith("# AGENTS.md instructions for ")) return instructionsOf(text);
  if (tag === "skill") {
    const name = /<name>(.+?)<\/name>/.exec(text)?.[1] ?? "";
    return [{ component: "skills", id: `loaded:${name}`, text }];
  }
  if (tag) return [{ component: "system", id: slug(tag), text }];
  if (role === "developer") return [{ component: "system", id: first ? "prompt" : "developer", text }];
  return [{ component: "messages", id: role, text }];
};

const toolsOf = (tools: Json[]): Segment[] =>
  tools.flatMap((tool) => {
    if (tool["type"] === "namespace") {
      const server = /^mcp__(.+)$/.exec(String(tool["name"]))?.[1];
      const inner = Array.isArray(tool["tools"]) ? (tool["tools"] as Json[]) : [];
      if (!server) return toolsOf(inner);
      return inner.map((entry) => ({
        component: "mcp" as const,
        id: `${server}/${entry["name"]}`,
        text: JSON.stringify(entry),
      }));
    }
    return [{ component: "tools" as const, id: String(tool["name"] ?? tool["type"]), text: JSON.stringify(tool) }];
  });

// The folder of the skill a shell command reads, like `cat .agents/skills/refunds/SKILL.md`.
const SKILL_READ = /(?:^|[\s'"=])([^\s'"]*?[^\s'"/]+)\/SKILL\.md\b/;

// Codex has no tool to load a skill: the model reads its SKILL.md through the shell, and that output is the
// skill's body in the context. A command that only names the file, like `find` or a patch, or a read that
// failed, shows no frontmatter. A skill named with `$name` comes as a `<skill>` message instead.
const skillRead = (call: Json | undefined, output: unknown, work: string) => {
  const args = typeof call?.["arguments"] === "string" ? call["arguments"] : "";
  const match = SKILL_READ.exec(args);
  if (!match || typeof output !== "string" || !/^name:\s*\S/m.test(output)) return undefined;
  return projectPath(work, match[1] as string);
};

// One Responses request of Codex, cut into the pieces of its loadout (ADR 0006).
export const segmentCodex = (request: Exchange, work: string): Segment[] => {
  const { body } = request;
  const input = Array.isArray(body["input"]) ? (body["input"] as Json[]) : [];
  const segments: Segment[] = toolsOf(Array.isArray(body["tools"]) ? (body["tools"] as Json[]) : []);
  const calls = new Map(
    input.filter((item) => item["call_id"] && item["arguments"]).map((item) => [item["call_id"], item]),
  );
  let first = true;
  for (const item of input) {
    if (item["type"] === "additional_tools") {
      segments.push(...toolsOf(Array.isArray(item["tools"]) ? (item["tools"] as Json[]) : []));
      continue;
    }
    const skill =
      item["type"] === "function_call_output" ? skillRead(calls.get(item["call_id"]), item["output"], work) : undefined;
    if (skill) {
      segments.push({ component: "skills", id: `loaded:${skill}`, text: JSON.stringify(item) });
      continue;
    }
    if (item["type"] !== "message") {
      segments.push({ component: "messages", id: String(item["type"]), text: JSON.stringify(item) });
      continue;
    }
    const role = String(item["role"]);
    for (const part of Array.isArray(item["content"]) ? (item["content"] as Json[]) : []) {
      segments.push(...partOf(String(part["text"] ?? ""), role, first && role === "developer"));
      if (role === "developer") first = false;
    }
  }
  return segments;
};
