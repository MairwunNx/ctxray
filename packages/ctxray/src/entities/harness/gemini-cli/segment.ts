import { dirname, resolve } from "node:path";
import type { Exchange, Json } from "#shared/contract/index.ts";
import type { Segment } from "../capture/model.ts";
import { projectPath, slug } from "../capture/sections.ts";

const CONTEXT = /--- Context from: (.+?) ---\n([\s\S]*?)\n--- End of Context from: \1 ---/g;
const IMPORT = /<!-- Imported from: (.+?) -->\n([\s\S]*?)\n<!-- End of import from: \1 -->/g;
const SERVER =
  /The following are instructions provided by the tool server '(.+?)':\n---\[start of server instructions\]---\n[\s\S]*?\n---\[end of server instructions\]---/g;
const SKILL = /<skill>\s*<name>(.+?)<\/name>[\s\S]*?<location>(.+?)<\/location>\s*<\/skill>/g;
const JIT = /\n*--- Newly Discovered Project Context ---\n([\s\S]*?)\n--- End Project Context ---/;

// A context file inlines what it imports, each import framed by comments: every one becomes a rule of its own.
const contextFiles = (text: string, work: string): Segment[] =>
  [...text.matchAll(CONTEXT)].flatMap(([whole, path = "", body = ""]) => withImports(whole, body, path, work));

const withImports = (whole: string, body: string, path: string, work: string): Segment[] => {
  const imports = [...body.matchAll(IMPORT)].flatMap(([nested, target = "", inner = ""]) =>
    withImports(nested, inner, resolve(dirname(path), target), work),
  );
  const own = whole.replace(body, body.replace(IMPORT, ""));
  return [{ component: "rules", id: projectPath(work, path), text: own, evidence: "marker" }, ...imports];
};

// What remains of a text once its known pieces are cut out, if anything does.
const rest = (text: string, pattern: RegExp, component: Segment["component"], id: string): Segment[] => {
  const left = text.replace(pattern, "").trim();
  return left === "" ? [] : [{ component, id, text: left }];
};

// The system instruction: Markdown sections, the skill listing, and the user's own GEMINI.md at the end.
const systemOf = (text: string, work: string): Segment[] =>
  text.split(/^(?=# )/m).flatMap((part, index): Segment[] => {
    const title = /^# (.+)$/m.exec(part)?.[1];
    const id = index === 0 || !title ? "prompt" : slug(title);
    const skills = [...part.matchAll(SKILL)].map(([whole, name = "", location = ""]) => ({
      component: "skills" as const,
      id: name,
      text: whole,
      source: projectPath(work, location),
    }));
    const files = contextFiles(part, work);
    const cut = part.replace(SKILL, "").replace(CONTEXT, "");
    return [...skills, ...files, { component: "system", id, text: cut }];
  });

// The first user turn: the session context, the context files, and the MCP servers' instructions.
const sessionOf = (text: string, work: string): Segment[] => [
  ...contextFiles(text, work),
  ...[...text.matchAll(SERVER)].map(([whole, name = ""]) => ({ component: "mcp" as const, id: name, text: whole })),
  ...rest(text.replace(CONTEXT, ""), SERVER, "system", "session-context"),
];

// A tool's result: the context files a read brought in, and the body of a skill the model activated.
const resultOf = (output: string, work: string): Segment[] => {
  const jit = JIT.exec(output);
  const skill = /^<activated_skill name="(.+?)">/.exec(output);
  return [
    ...(jit ? contextFiles(jit[1] ?? "", work) : []),
    ...(skill ? [{ component: "skills" as const, id: `loaded:${skill[1]}`, text: output }] : []),
    ...(skill ? [] : rest(output, JIT, "messages", "tool-result")),
  ];
};

const partOf = (part: Json, work: string, first: boolean): Segment[] => {
  if (typeof part["text"] === "string") {
    return first && part["text"].startsWith("<session_context>")
      ? sessionOf(part["text"], work)
      : [{ component: "messages", id: "user", text: part["text"] }];
  }
  const response = part["functionResponse"] as Json | undefined;
  const output = (response?.["response"] as Json | undefined)?.["output"];
  if (typeof output === "string") return resultOf(output, work);
  return [{ component: "messages", id: Object.keys(part)[0] ?? "part", text: JSON.stringify(part) }];
};

// MCP tools are `mcp_<server>_<tool>`, their schemas inline like every other tool's.
const toolOf = (declaration: Json): Segment => {
  const name = String(declaration["name"]);
  const mcp = /^mcp_([^_]+)_(.+)$/.exec(name);
  const text = JSON.stringify(declaration);
  return mcp ? { component: "mcp", id: `${mcp[1]}/${mcp[2]}`, text } : { component: "tools", id: name, text };
};

const list = (value: unknown) => (Array.isArray(value) ? (value as Json[]) : []);

// One Gemini API request of Gemini CLI, cut into the pieces of its loadout (ADR 0007).
export const segmentGeminiCli = (request: Exchange, work: string): Segment[] => {
  const { body } = request;
  const system = list((body["systemInstruction"] as Json | undefined)?.["parts"]).map((part) => String(part["text"]));
  const segments = systemOf(system.join("\n"), work);
  list(body["contents"]).forEach((content, index) => {
    for (const part of list(content["parts"])) segments.push(...partOf(part, work, index === 0));
  });
  for (const tool of list(body["tools"])) segments.push(...list(tool["functionDeclarations"]).map(toolOf));
  return segments;
};
