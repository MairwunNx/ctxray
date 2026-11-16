import { expect, test } from "bun:test";
import { nearMiss } from "./near-miss.ts";

// What spike 0017 found the harnesses do with each name.
test.each([
  ["AGENT.md", "AGENTS.md", "name"],
  ["agent.md", "AGENTS.md", "name"],
  ["AGENTS.MD", "AGENTS.md", "case"],
  ["Agents.md", "AGENTS.md", "case"],
  ["agents.md", "AGENTS.md", "case"],
  ["CLAUDE.MD", "CLAUDE.md", "case"],
  ["claude.md", "CLAUDE.md", "case"],
  ["Claude.md", "CLAUDE.md", "case"],
  ["CLAUDE.local.MD", "CLAUDE.local.md", "case"],
  ["GEMINI.MD", "GEMINI.md", "case"],
  ["AGENTS.override.MD", "AGENTS.override.md", "case"],
  ["CLAUDE.markdown", "CLAUDE.md", "name"],
  [".cursorrule", ".cursorrules", "name"],
  [".cursor-rules", ".cursorrules", "name"],
  [".claude/rule/style.md", ".claude/rules/style.md", "name"],
  [".Claude/rules/style.md", ".claude/rules/style.md", "case"],
  [".claude/Rules/style.md", ".claude/rules/style.md", "case"],
  [".claude/rules/style.MD", ".claude/rules/style.md", "name"],
  [".claude/command/review.md", ".claude/commands/review.md", "name"],
  [".cursor/rule/web.mdc", ".cursor/rules/web.mdc", "name"],
  [".cursor/rules/web.md", ".cursor/rules/web.mdc", "name"],
  [".claude/skill/refunds/SKILL.md", ".claude/skills/refunds/SKILL.md", "name"],
  [".agent/skills/refunds/SKILL.md", ".agents/skills/refunds/SKILL.md", "name"],
  [".agents/skill/refunds/SKILL.md", ".agents/skills/refunds/SKILL.md", "name"],
  [".codex/skill/refunds/SKILL.md", ".codex/skills/refunds/SKILL.md", "name"],
  [".gemini/skill/refunds/SKILL.md", ".gemini/skills/refunds/SKILL.md", "name"],
  [".claude/skills/refunds/skill.md", ".claude/skills/refunds/SKILL.md", "case"],
  [".claude/Skills/Refunds/SKILL.md", ".claude/skills/Refunds/SKILL.md", "case"],
  [".claude/skills/refunds.md", ".claude/skills/refunds/SKILL.md", "name"],
  ["mcp.json", ".mcp.json", "name"],
  [".claude/mcp.json", ".mcp.json", "name"],
  [".mcp.jsonc", ".mcp.json", "name"],
  [".MCP.json", ".mcp.json", "case"],
  [".cursor/mcp.jsonc", ".cursor/mcp.json", "name"],
  [".gemini/settings.jsonc", ".gemini/settings.json", "name"],
  [".gemini/Settings.json", ".gemini/settings.json", "case"],
  [".codex/config.yaml", ".codex/config.toml", "name"],
  ["opencode.yaml", "opencode.json", "name"],
  ["app/AGENT.md", "app/AGENTS.md", "name"],
  ["app/CLAUDE.MD", "app/CLAUDE.md", "case"],
])("%s → %s (%s)", (path, expected, kind) => {
  expect(nearMiss(path)).toMatchObject({ expected, kind });
});

// Right names, other harnesses' valid places, and documents that only look like instruction files.
test.each([
  "AGENTS.md",
  "app/CLAUDE.md",
  ".opencode/skill/refunds/SKILL.md",
  ".opencode/opencode.json",
  "opencode.jsonc",
  ".cursor/mcp.json",
  ".cursor/rules/web.MDC",
  "docs/claude.md",
  "docs/agent.md",
  "Agents/CLAUDE.md",
  ".claude/skills/rules/SKILL.md",
  "README.md",
  "src/mcp.json",
  ".claude/skills/README.md",
])("%s is fine", (path) => {
  expect(nearMiss(path)).toBeUndefined();
});
