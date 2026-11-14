import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { HarnessId } from "#shared/contract/index.ts";
import { STATIC_ADAPTERS } from "./adapters.ts";
import { lint } from "./layers/lint.ts";
import { chainTo, matchingGlob, openProject, parentDirs } from "./project.ts";

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

// A temporary project outside any git repository, so the file list comes from a walk.
const project = async (files: Record<string, string>) => {
  const root = mkdtempSync(join(tmpdir(), "ctxray-static-"));
  roots.push(root);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return openProject(root);
};

const analyse = async (harness: HarnessId, files: Record<string, string>, cwd = "", touched: string[] = []) => {
  const opened = await project(files);
  const adapter = STATIC_ADAPTERS[harness];
  if (!adapter) throw new Error(harness);
  const inventory = await adapter.discover(opened);
  const problems = (await lint(opened, inventory)).map((found) => `${found.key} ${found.path}`);
  const loadout = adapter.resolve(inventory, { cwd, files: touched });
  const rules = loadout.rules.map((rule) => `${rule.path} ${rule.reason}`);
  return { problems, rules, loadout, ignored: inventory.ignored ?? [] };
};

describe("project", () => {
  test("walks a folder outside git and skips .git and node_modules", async () => {
    const opened = await project({ "a.md": "", "src/b.ts": "", "node_modules/x/c.js": "", ".git/HEAD": "" });
    expect(opened.files).toEqual(["a.md", "src/b.ts"]);
    expect(opened.dirs).toEqual(["", "src"]);
  });

  test.each<[string, string[]]>([
    ["", [""]],
    ["app", ["", "app"]],
    ["app/src/x", ["", "app", "app/src", "app/src/x"]],
  ])("chainTo(%j)", (cwd, chain) => {
    expect(chainTo(cwd)).toEqual(chain);
  });

  test("parentDirs of a file", () => {
    expect(parentDirs("a/b/c.ts")).toEqual(["", "a", "a/b"]);
  });

  test.each<[string[], string, string, string | undefined]>([
    [["*.kt"], "app", "app/src/A.kt", "*.kt"],
    [["*.kt"], "app", "lib/A.kt", undefined],
    [["src/*.ts", "/*.md"], "", "README.md", "/*.md"],
  ])("matchingGlob(%j, %j, %j)", (globs, dir, file, match) => {
    expect(matchingGlob(globs, dir, file)).toBe(match as string);
  });
});

describe("claude code", () => {
  test("reads AGENTS.md where no CLAUDE.md exists, and a nested one on read", async () => {
    const files = { "AGENTS.md": "root", "lib/AGENTS.md": "lib", "lib/a.ts": "" };
    const { rules, problems } = await analyse("claude-code", files, "", ["lib/a.ts"]);
    expect(problems).toEqual([]);
    expect(rules).toEqual(["AGENTS.md cwd", "lib/AGENTS.md nested:lib/a.ts"]);
  });

  test.each([".claude/CLAUDE.md", "CLAUDE.local.md"])("%s turns AGENTS.md off", async (claude) => {
    const { rules, problems, ignored } = await analyse("claude-code", { "AGENTS.md": "root", [claude]: "claude" });
    expect([problems, ignored]).toEqual([[], ["AGENTS.md"]]);
    expect(rules).toEqual([`${claude} cwd`]);
  });

  test("CLAUDE.local.md follows CLAUDE.md, and a disabled MCP server stays out", async () => {
    const { rules, loadout } = await analyse("claude-code", {
      "CLAUDE.md": "team",
      "CLAUDE.local.md": "mine",
      ".mcp.json": JSON.stringify({ mcpServers: { a: { command: "a" }, b: { url: "http://b.test" } } }),
      ".claude/settings.local.json": JSON.stringify({ disabledMcpjsonServers: ["b"] }),
    });
    expect(rules).toEqual(["CLAUDE.md cwd", "CLAUDE.local.md cwd"]);
    expect(loadout.mcp.servers).toEqual([{ name: "a" }]);
  });

  test("a skill with paths shows up only for matching files", async () => {
    const files = { ".claude/skills/kt/SKILL.md": '---\ndescription: Kotlin\npaths: "*.kt"\n---\n', "A.kt": "" };
    expect((await analyse("claude-code", files)).loadout.skills.listed).toEqual([]);
    const touched = await analyse("claude-code", files, "", ["A.kt"]);
    expect(touched.loadout.skills.listed.map((skill) => skill.name)).toEqual(["kt"]);
  });

  test("broken JSON is an error", async () => {
    const { problems } = await analyse("claude-code", { ".mcp.json": "{ nope" });
    expect(problems).toEqual(["lint.badJson .mcp.json"]);
  });
});

describe("codex", () => {
  test("takes fallback names and skips disabled skills", async () => {
    const { rules, loadout, problems } = await analyse("codex", {
      ".codex/config.toml":
        'project_doc_fallback_filenames = ["TEAM.md"]\n[[skills.config]]\nname = "off"\nenabled = false\n',
      "TEAM.md": "team",
      ".agents/skills/on/SKILL.md": "---\nname: on\ndescription: On.\n---\n",
      ".agents/skills/off/SKILL.md": "---\nname: off\ndescription: Off.\n---\n",
    });
    expect(problems).toEqual([]);
    expect(rules).toEqual(["TEAM.md cwd"]);
    expect(loadout.skills.listed.map((skill) => skill.name)).toEqual(["on"]);
  });

  test("broken TOML is an error", async () => {
    const { problems } = await analyse("codex", { ".codex/config.toml": "model = " });
    expect(problems).toEqual(["lint.badToml .codex/config.toml"]);
  });

  test.each([
    ["is over the budget alone", "x".repeat(5), "y".repeat(30), "lint.overBudget a/AGENTS.md"],
    ["crosses it with the files above", "x".repeat(15), "y".repeat(15), "lint.budget a/AGENTS.md"],
  ])("a file that %s gets its own warning", async (_, top, nested, expected) => {
    const config = { ".codex/config.toml": "project_doc_max_bytes = 20" };
    const { problems } = await analyse("codex", { ...config, "AGENTS.md": top, "a/AGENTS.md": nested });
    expect(problems).toEqual([expected]);
  });
});
