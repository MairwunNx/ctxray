import type { Exchange, Json } from "#shared/contract/index.ts";
import type { Segment } from "../capture/model.ts";
import { projectPath, slug } from "../capture/sections.ts";

const BLOCK = /<([a-z_]+)(?: [^>]*)?>[\s\S]*?<\/\1>/g;
const ALWAYS = /<always_applied_workspace_rule name="(.+?)">[\s\S]*?<\/always_applied_workspace_rule>/g;
const REQUESTABLE = /<agent_requestable_workspace_rule fullPath="(.+?)">[\s\S]*?<\/agent_requestable_workspace_rule>/g;
const SKILL = /<agent_skill fullPath="(.+?)">[\s\S]*?<\/agent_skill>/g;
const ALIAS = /^(\$\d+) = (.+)$/gm;
const SERVER = /<mcp_meta_tool_server name="(.+?)"[^>]*\/>/g;
const READ_RULES =
  /\n*The following cursor rule files are relevant to the files you just read:\n([\s\S]*?)(?=\n*Consider these rules|\n*The following skills may be relevant|$(?![\s\S]))/;
const READ_SKILLS = /\n*The following skills may be relevant to the files you just read:\n([\s\S]*)$/;
// An absolute path, or `<work>/…` in a recorded payload, of a rule file or a SKILL.md.
const ENTRY = /^- ((?:\/|<work>\/).*(?:\.mdc?|\.cursorrules))$/gm;

// A skill is its folder: `$0/refunds/SKILL.md` with `$0 = <work>/.claude/skills`.
const skillOf = (whole: string, path: string, work: string): Segment => {
  const source = projectPath(work, path);
  const name = source.split("/").at(-2) ?? source;
  return { component: "skills", id: name, text: whole, source };
};

// `- <path>` then its text, up to the next entry: what a read brought in.
const entries = (text: string) => {
  const found = [...text.matchAll(ENTRY)];
  return found.map((match, index) => ({
    path: match[1] as string,
    text: text.slice(match.index, found[index + 1]?.index ?? text.length),
  }));
};

const rulesOf = (text: string, work: string): Segment[] => [
  ...[...text.matchAll(ALWAYS)].map(([whole, path = ""]) => ({
    component: "rules" as const,
    id: projectPath(work, path),
    text: whole,
    evidence: "marker" as const,
  })),
  ...[...text.matchAll(REQUESTABLE)].map(([whole, path = ""]) => ({
    component: "rules" as const,
    id: projectPath(work, path),
    text: whole,
    evidence: "marker" as const,
  })),
  { component: "system", id: "rules-instructions", text: text.replace(ALWAYS, "").replace(REQUESTABLE, "") },
];

const skillsOf = (text: string, work: string): Segment[] => {
  const aliases = new Map([...text.matchAll(ALIAS)].map(([, alias = "", dir = ""]) => [alias, dir]));
  const expand = (path: string) => path.replace(/^\$\d+/, (alias) => aliases.get(alias) ?? alias);
  return [
    ...[...text.matchAll(SKILL)].map(([whole, path = ""]) => skillOf(whole, expand(path), work)),
    { component: "system", id: "skills-instructions", text: text.replace(SKILL, "") },
  ];
};

// The first user message: the session's facts, the rules, the skill listing, and the MCP catalogue.
const contextOf = (text: string, work: string): Segment[] =>
  [...text.matchAll(BLOCK)].flatMap(([whole, tag = ""]): Segment[] => {
    if (tag === "rules") return rulesOf(whole, work);
    if (tag === "agent_skills") return skillsOf(whole, work);
    if (tag === "mcp_server_catalog") {
      const servers = [...whole.matchAll(SERVER)].map(([one, name = ""]) => ({
        component: "mcp" as const,
        id: name,
        text: one,
      }));
      return [...servers, { component: "system", id: "mcp-catalog", text: whole.replace(SERVER, "") }];
    }
    if (tag === "user_query") return [{ component: "messages", id: "user", text: whole }];
    return [{ component: "system", id: slug(tag), text: whole }];
  });

// A read's result: the file, then the rules and skills that apply to it.
const resultOf = (text: string, work: string): Segment[] => {
  const rules = READ_RULES.exec(text)?.[1] ?? "";
  const skills = READ_SKILLS.exec(text)?.[1] ?? "";
  const rest = text.replace(READ_RULES, "").replace(READ_SKILLS, "").trim();
  return [
    ...entries(rules).map(({ path, text: body }) => ({
      component: "rules" as const,
      id: projectPath(work, path),
      text: body,
      evidence: "marker" as const,
    })),
    ...entries(skills).map(({ path, text: body }) => skillOf(body, path, work)),
    ...(rest === "" ? [] : [{ component: "messages" as const, id: "tool-result", text: rest }]),
  ];
};

const list = (value: unknown) => (Array.isArray(value) ? (value as Json[]) : []);
const textOf = (content: unknown) => (typeof content === "string" ? content : JSON.stringify(content ?? ""));

// One Chat Completions request of the Cursor CLI local build, cut into the pieces of its loadout (ADR 0009).
export const segmentCursorCli = (request: Exchange, work: string): Segment[] => {
  const { body } = request;
  const segments: Segment[] = [];
  for (const message of list(body["messages"])) {
    const role = String(message["role"]);
    const text = textOf(message["content"]);
    if (role === "system") {
      const sections = [...text.matchAll(BLOCK)].map(([whole, tag = ""]) => ({
        component: "system" as const,
        id: slug(tag),
        text: whole,
      }));
      segments.push({ component: "system", id: "prompt", text: text.replace(BLOCK, "") }, ...sections);
    } else if (role === "user") segments.push(...contextOf(text, work));
    else if (role === "tool") segments.push(...resultOf(text, work));
    else segments.push({ component: "messages", id: role, text: JSON.stringify(message) });
  }
  for (const tool of list(body["tools"])) {
    const fn = (tool["function"] as Json | undefined) ?? tool;
    segments.push({ component: "tools", id: String(fn["name"]), text: JSON.stringify(tool) });
  }
  return segments;
};
