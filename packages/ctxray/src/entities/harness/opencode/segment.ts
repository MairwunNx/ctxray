import type { Exchange, Json } from "#shared/contract/index.ts";
import type { Segment } from "../capture/model.ts";
import { projectPath, slug } from "../capture/sections.ts";

const INSTRUCTIONS =
  /^Instructions from: (.+)\n([\s\S]*?)(?=^Instructions from: |^<mcp_instructions>|^Skills provide |$(?![\s\S]))/gm;
const SERVERS = /<mcp_instructions>[\s\S]*?<\/mcp_instructions>/;
const SERVER = /<server name="(.+?)">[\s\S]*?<\/server>/g;
const SKILLS = /^Skills provide [\s\S]*?<\/available_skills>/m;
const SKILL = /<skill>\s*<name>(.+?)<\/name>[\s\S]*?<location>(.+?)<\/location>\s*<\/skill>/g;
const ENV = /<env>[\s\S]*?<\/env>/;
const REMINDER = /<system-reminder>\n?([\s\S]*?)\n?<\/system-reminder>/g;

const rules = (text: string, work: string): Segment[] =>
  [...text.matchAll(INSTRUCTIONS)].map(([whole, path = ""]) => ({
    component: "rules",
    id: projectPath(work, path.trim()),
    text: whole,
    evidence: "marker",
  }));

// The system message: the base prompt's sections, the environment, then the instruction files, the servers'
// instructions, and the skill listing (ADR 0008).
const systemOf = (text: string, work: string): Segment[] => {
  const files = rules(text, work);
  const servers = [...(SERVERS.exec(text)?.[0] ?? "").matchAll(SERVER)].map(([whole, name = ""]) => ({
    component: "mcp" as const,
    id: name,
    text: whole,
  }));
  const listing = SKILLS.exec(text)?.[0] ?? "";
  const skills = [...listing.matchAll(SKILL)].map(([whole, name = "", location = ""]) => ({
    component: "skills" as const,
    id: name,
    text: whole,
    ...(location !== "&lt;built-in&gt;" && { source: projectPath(work, location) }),
  }));
  const env = ENV.exec(text)?.[0];
  const rest = text.replace(INSTRUCTIONS, "").replace(SERVERS, "").replace(SKILLS, "").replace(ENV, "");
  const sections = rest.split(/^(?=# )/m).flatMap((part, index): Segment[] => {
    const title = /^# (.+)$/m.exec(part)?.[1];
    return part.trim() === ""
      ? []
      : [{ component: "system", id: index === 0 || !title ? "prompt" : slug(title), text: part }];
  });
  return [
    ...sections,
    ...(env ? [{ component: "system" as const, id: "env", text: env }] : []),
    ...files,
    ...servers,
    { component: "system", id: "skills-instructions", text: listing.replace(SKILL, "") },
    ...skills,
  ];
};

// A tool's result: the instruction files a read brought in, and the body of a skill the model loaded.
const resultOf = (text: string, work: string): Segment[] => {
  const skill = /<skill_content name="(.+?)">/.exec(text);
  if (skill) return [{ component: "skills", id: `loaded:${skill[1]}`, text }];
  const found = [...text.matchAll(REMINDER)].flatMap(([, body = ""]) => rules(body, work));
  const rest = text.replace(REMINDER, "").trim();
  return [...found, ...(rest === "" ? [] : [{ component: "messages" as const, id: "tool-result", text: rest }])];
};

const textOf = (content: unknown): string =>
  typeof content === "string"
    ? content
    : (Array.isArray(content) ? (content as Json[]) : [])
        .map((block) => (block["type"] === "text" ? String(block["text"]) : textOf(block["content"])))
        .join("\n");

// OpenCode sanitises an MCP tool's name to `<server>_<tool>`. Its own tools carry no underscore.
const toolOf = (name: string, text: string): Segment => {
  const mcp = /^([^_]+)_(.+)$/.exec(name);
  return mcp && name !== "apply_patch"
    ? { component: "mcp", id: `${mcp[1]}/${mcp[2]}`, text }
    : { component: "tools", id: name, text };
};

const list = (value: unknown) => (Array.isArray(value) ? (value as Json[]) : []);

// One request of OpenCode, in either wire: Chat Completions with a system message, or Anthropic Messages with
// a system field when the config picks the anthropic provider.
export const segmentOpencode = (request: Exchange, work: string): Segment[] => {
  const { body } = request;
  const segments: Segment[] = body["system"] === undefined ? [] : systemOf(textOf(body["system"]), work);
  for (const message of list(body["messages"])) {
    const role = String(message["role"]);
    const blocks = list(message["content"]);
    const results = blocks.filter((block) => block["type"] === "tool_result");
    if (role === "system") segments.push(...systemOf(textOf(message["content"]), work));
    else if (role === "tool") segments.push(...resultOf(textOf(message["content"]), work));
    else if (results.length > 0) segments.push(...results.flatMap((block) => resultOf(textOf(block["content"]), work)));
    else
      segments.push({ component: "messages", id: role, text: textOf(message["content"]) || JSON.stringify(message) });
  }
  for (const tool of list(body["tools"])) {
    const fn = (tool["function"] as Json | undefined) ?? tool;
    segments.push(toolOf(String(fn["name"]), JSON.stringify(tool)));
  }
  return segments;
};
