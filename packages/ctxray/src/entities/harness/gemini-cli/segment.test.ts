import { expect, test } from "bun:test";
import type { Exchange } from "#shared/contract/index.ts";
import { segmentGeminiCli } from "./segment.ts";

const W = "/w";
const frame = (path: string, body: string) =>
  `--- Context from: ${path} ---\n${body}\n--- End of Context from: ${path} ---`;

const request = (body: Exchange["body"]): Exchange => ({
  seq: 0,
  session: "s",
  protocol: "gemini",
  path: "/v1beta/models/m:streamGenerateContent",
  position: 0,
  retries: 0,
  headers: {},
  body,
});

const session = [
  "<session_context>",
  "This is the Gemini CLI.",
  "<loaded_context>",
  "<project_context>",
  frame(
    `${W}/GEMINI.md`,
    "Root.\n<!-- Imported from: ./docs/style.md -->\nStyle.\n<!-- End of import from: ./docs/style.md -->",
  ),
  "",
  "The following are instructions provided by the tool server 'jira':",
  "---[start of server instructions]---",
  "Use jira.",
  "---[end of server instructions]---",
  "</project_context>",
  "</loaded_context>",
  "</session_context>",
].join("\n");

const read = `code\n\n--- Newly Discovered Project Context ---\n${frame(`${W}/sub/GEMINI.md`, "Sub.")}\n--- End Project Context ---`;

test("context files, imports, server instructions, read results, skills, and MCP tools", () => {
  const segments = segmentGeminiCli(
    request({
      systemInstruction: { parts: [{ text: "You are Gemini.\n# Core Mandates\nBe careful." }] },
      contents: [
        { role: "user", parts: [{ text: session }, { text: "Do it." }] },
        { role: "model", parts: [{ functionCall: { name: "read_file", args: {} } }] },
        { role: "user", parts: [{ functionResponse: { name: "read_file", response: { output: read } } }] },
        {
          role: "user",
          parts: [
            { functionResponse: { response: { output: '<activated_skill name="deploy">Go.</activated_skill>' } } },
          ],
        },
      ],
      tools: [{ functionDeclarations: [{ name: "read_file" }, { name: "mcp_jira_search_issues" }] }],
    }),
    W,
  );
  expect(segments.map((segment) => `${segment.component} ${segment.id}`)).toEqual([
    "system prompt",
    "system core-mandates",
    "rules GEMINI.md",
    "rules docs/style.md",
    "mcp jira",
    "system session-context",
    "messages user",
    "messages functionCall",
    "rules sub/GEMINI.md",
    "messages tool-result",
    "skills loaded:deploy",
    "tools read_file",
    "mcp jira/search_issues",
  ]);
  const root = segments.find((segment) => segment.id === "GEMINI.md");
  expect(root?.text).not.toContain("Style.");
});
