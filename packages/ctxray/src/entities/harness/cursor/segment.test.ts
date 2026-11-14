import { expect, test } from "bun:test";
import type { Exchange } from "#shared/contract/index.ts";
import { segmentCursorCli } from "./segment.ts";

const W = "/w";

const context = [
  "<user_info>\nOS Version: darwin\n</user_info>",
  "<rules>\nThe rules section.\n<always_applied_workspace_rules>",
  '<always_applied_workspace_rule name="/w/AGENTS.md">Root.</always_applied_workspace_rule>',
  "</always_applied_workspace_rules>",
  '<agent_requestable_workspace_rule fullPath="/w/.cursor/rules/db.mdc">Database work</agent_requestable_workspace_rule>',
  "</rules>",
  "<agent_skills>\n<available_skills>\n$0 = /w/.cursor/skills",
  '<agent_skill fullPath="$0/deploy/SKILL.md">Deploy.</agent_skill>',
  "</available_skills>\n</agent_skills>",
  '<mcp_server_catalog>\n<mcp_meta_tool_server name="jira" tools="search" serverUseInstructions="Use jira." />\n</mcp_server_catalog>',
].join("\n");

const read = [
  "     1|export const x = 1;",
  "",
  "The following cursor rule files are relevant to the files you just read:",
  "",
  "- /w/src/AGENTS.md",
  "# Service",
  "- a list item, not a file",
  "",
  "- /w/.cursor/rules/ts.mdc",
  "Prefer type aliases.",
  "",
  "Consider these rules if they affect your changes.",
  "",
  "The following skills may be relevant to the files you just read:",
  "",
  "- /w/src/.agents/skills/build/SKILL.md",
  "Build the service.",
].join("\n");

test("the context message, a read's rules and skills, and the tools", () => {
  const request: Exchange = {
    seq: 0,
    session: "s",
    protocol: "chat",
    path: "/v1/chat/completions",
    position: 1,
    retries: 0,
    headers: {},
    body: {
      messages: [
        { role: "system", content: "You are an AI coding assistant.\n<tone_and_style>\nBe brief.\n</tone_and_style>" },
        { role: "user", content: context },
        { role: "user", content: "<user_query>\nDo it.\n</user_query>" },
        { role: "tool", content: read },
      ],
      tools: [{ type: "function", function: { name: "Read" } }],
    },
  };
  const segments = segmentCursorCli(request, W);
  expect(segments.map((segment) => `${segment.component} ${segment.id}`)).toEqual([
    "system prompt",
    "system tone-and-style",
    "system user-info",
    "rules AGENTS.md",
    "rules .cursor/rules/db.mdc",
    "system rules-instructions",
    "skills deploy",
    "system skills-instructions",
    "mcp jira",
    "system mcp-catalog",
    "messages user",
    "rules src/AGENTS.md",
    "rules .cursor/rules/ts.mdc",
    "skills build",
    "messages tool-result",
    "tools Read",
  ]);
  expect(segments.find((segment) => segment.id === "src/AGENTS.md")?.text).toContain("a list item");
  expect(segments.find((segment) => segment.id === "build")?.source).toBe("src/.agents/skills/build/SKILL.md");
});
