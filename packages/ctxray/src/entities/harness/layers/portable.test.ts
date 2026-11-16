import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { HarnessId } from "#shared/contract/index.ts";
import { STATIC_ADAPTERS } from "../adapters.ts";
import { openProject } from "../project.ts";
import { absolutePaths } from "./portable.ts";

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

const found = async (harness: HarnessId, files: Record<string, string>) => {
  const root = mkdtempSync(join(tmpdir(), "ctxray-portable-"));
  roots.push(root);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  const project = await openProject(root);
  const inventory = await STATIC_ADAPTERS[harness]?.discover(project);
  if (!inventory) throw new Error(harness);
  return (await absolutePaths(project, inventory)).map(
    ({ path, line, params }) => `${path}:${line} ${params["value"]}`,
  );
};

test.each<[HarnessId, Record<string, string>, string[]]>([
  ["claude-code", { "CLAUDE.md": "# Notes\n\n@~/.claude/team.md\n" }, ["CLAUDE.md:3 ~/.claude/team.md"]],
  [
    "claude-code",
    { "CLAUDE.md": "See [the guide](/Users/anna/docs/guide.md).\n" },
    ["CLAUDE.md:1 /Users/anna/docs/guide.md"],
  ],
  [
    "claude-code",
    { "CLAUDE.md": "See [the guide](file:///home/anna/guide.md).\n" },
    ["CLAUDE.md:1 /home/anna/guide.md"],
  ],
  [
    "claude-code",
    { ".claude/rules/web.md": '---\npaths:\n  - "C:\\\\work\\\\web\\\\**"\n---\nUse React.\n' },
    [".claude/rules/web.md:3 C:\\\\work\\\\web\\\\**"],
  ],
  [
    "claude-code",
    {
      ".mcp.json":
        '{\n  "mcpServers": {\n    "db": { "command": "/Users/anna/bin/db-mcp", "args": ["--dir", "/usr/share/db"] }\n  }\n}\n',
    },
    [".mcp.json:3 /Users/anna/bin/db-mcp"],
  ],
  [
    "codex",
    { ".codex/config.toml": '[mcp_servers.db]\ncommand = "npx"\nargs = ["-y", "db-mcp"]\ncwd = "/home/anna/db"\n' },
    [".codex/config.toml:4 /home/anna/db"],
  ],
  ["opencode", { "opencode.json": '{ "instructions": ["~/notes/*.md"] }\n' }, ["opencode.json:1 ~/notes/*.md"]],
  // Paths every machine has, URLs, relative paths, and code examples stay quiet.
  ["claude-code", { "CLAUDE.md": "Run `/Users/anna/x`.\n\n[docs](https://example.com/a)\n\n@docs/a.md\n" }, []],
  ["claude-code", { ".mcp.json": '{ "mcpServers": { "a": { "command": "/usr/local/bin/a" } } }' }, []],
  ["codex", { ".mcp.json": '{ "mcpServers": { "a": { "command": "/Users/anna/a" } } }' }, []],
])("%s %j", async (harness, files, expected) => {
  expect(await found(harness, files)).toEqual(expected);
});
