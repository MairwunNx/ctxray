import { expect, test } from "bun:test";
import type { Exchange } from "#shared/contract/index.ts";
import { segmentOpencode } from "./segment.ts";

const W = "/w";

const system = [
  "You are OpenCode.",
  "# Tone and style",
  "Be brief.",
  "<env>",
  "  Working directory: /w",
  "</env>",
  "Instructions from: /w/AGENTS.md",
  "Root rules.",
  "",
  "<mcp_instructions>",
  '  <server name="jira">',
  "    Use jira.",
  "  </server>",
  "</mcp_instructions>",
  "Skills provide specialized instructions.",
  "<available_skills>",
  "  <skill>",
  "    <name>deploy</name>",
  "    <description>Deploy.</description>",
  "    <location>/w/.opencode/skills/deploy/SKILL.md</location>",
  "  </skill>",
  "</available_skills>",
].join("\n");

const read =
  "<path>/w/sub/x.ts</path>\n<system-reminder>\nInstructions from: /w/sub/AGENTS.md\nSub rules.\n</system-reminder>";

const request = (body: Exchange["body"]): Exchange => ({
  seq: 0,
  session: "s",
  protocol: "chat",
  path: "/v1/chat/completions",
  position: 0,
  retries: 0,
  headers: {},
  body,
});

test("the system message, a read's reminders, a loaded skill, and MCP tools", () => {
  const segments = segmentOpencode(
    request({
      messages: [
        { role: "system", content: system },
        { role: "user", content: "Do it." },
        { role: "tool", content: read },
        { role: "tool", content: '<skill_content name="deploy"># Skill: deploy</skill_content>' },
      ],
      tools: [
        { type: "function", function: { name: "read" } },
        { type: "function", function: { name: "jira_search" } },
      ],
    }),
    W,
  );
  expect(segments.map((segment) => `${segment.component} ${segment.id}`)).toEqual([
    "system prompt",
    "system tone-and-style",
    "system env",
    "rules AGENTS.md",
    "mcp jira",
    "system skills-instructions",
    "skills deploy",
    "messages user",
    "rules sub/AGENTS.md",
    "messages tool-result",
    "skills loaded:deploy",
    "tools read",
    "mcp jira/search",
  ]);
  expect(segments.find((segment) => segment.id === "deploy")?.source).toBe(".opencode/skills/deploy/SKILL.md");
});

test("the anthropic provider's system field and tool results", () => {
  const segments = segmentOpencode(
    request({
      system: [{ type: "text", text: "Instructions from: /w/AGENTS.md\nRoot." }],
      messages: [{ role: "user", content: [{ type: "tool_result", content: [{ type: "text", text: read }] }] }],
    }),
    W,
  );
  expect(segments.filter((segment) => segment.component === "rules").map((segment) => segment.id)).toEqual([
    "AGENTS.md",
    "sub/AGENTS.md",
  ]);
});
