import { afterAll, expect, test } from "bun:test";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchClaudeCode } from "../claude-code/launch.ts";
import { launchCodex } from "../codex/launch.ts";
import { launchGeminiCli } from "../gemini-cli/launch.ts";
import { launchOpencode } from "../opencode/launch.ts";
import type { LaunchContext } from "./model.ts";

const root = mkdtempSync(join(tmpdir(), "ctxray-user-scope-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

// The user's own setup: a CLAUDE.md, a skill linked from elsewhere, settings, and Codex's AGENTS.md.
const home = join(root, "user");
const write = (path: string, text: string) => {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, text);
};
write(join(home, ".claude/CLAUDE.md"), "user rules");
write(join(home, ".claude/settings.json"), '{"env":{"ANTHROPIC_BASE_URL":"https://elsewhere"}}');
write(join(home, "shared-skills/review/SKILL.md"), "---\nname: review\n---\n");
mkdirSync(join(home, ".claude/skills"), { recursive: true });
symlinkSync(join(home, "shared-skills/review"), join(home, ".claude/skills/review"));
write(join(home, ".codex/AGENTS.md"), "codex user rules");
write(join(home, ".codex/config.toml"), 'model_provider = "openai"');
write(join(home, ".agents/skills/deploy/SKILL.md"), "---\nname: deploy\n---\n");
write(join(home, ".gemini/GEMINI.md"), "gemini user rules");
write(join(home, ".config/opencode/AGENTS.md"), "opencode user rules");
write(
  join(home, ".config/opencode/opencode.json"),
  '{"model":"x/y","mcp":{"notes":{"type":"remote","url":"https://n"}}}',
);
write(
  join(home, ".gemini/settings.json"),
  '{\n  // comments are fine here\n  "security": {"auth": {"selectedType": "oauth-personal"}},\n' +
    '  "mcpServers": {"fs": {"command": "npx", "args": ["fs"]}},\n  "hooks": {"SessionStart": []}\n}',
);

let count = 0;
const contextOf = (inherit: boolean): LaunchContext => {
  const run = join(root, `run-${++count}`);
  const dirs = {
    root: run,
    work: join(run, "work"),
    home: join(run, "home"),
    tmp: join(run, "tmp"),
    bin: "",
    logs: "",
  };
  mkdirSync(dirs.work, { recursive: true });
  return {
    dirs,
    cwd: "",
    prompt: "hi",
    model: "m",
    provider: undefined,
    baseUrl: "http://127.0.0.1:1",
    env: {},
    shim: async (_, command) => [...command],
    remote: (_, url) => url,
    user: inherit ? { home, env: {}, project: join(root, "project") } : undefined,
  };
};

test("isolated by default: nothing of the user's reaches the run", async () => {
  const context = contextOf(false);
  await launchClaudeCode("claude", context);
  await launchCodex("codex", context);
  await launchGeminiCli("gemini", context);
  await launchOpencode("opencode", context);
  expect(await Array.fromAsync(new Bun.Glob("**/*.md").scan(context.dirs.home))).toEqual([]);
});

test("inherit copies Claude Code's rules and skills, never its settings or a link back", async () => {
  const context = contextOf(true);
  const { env } = await launchClaudeCode("claude", context);
  const config = env["CLAUDE_CONFIG_DIR"] ?? "";
  expect(readFileSync(join(config, "CLAUDE.md"), "utf8")).toBe("user rules");
  expect(lstatSync(join(config, "skills/review")).isSymbolicLink()).toBe(false);
  expect(readFileSync(join(config, "skills/review/SKILL.md"), "utf8")).toContain("name: review");
  expect(await Bun.file(join(config, "settings.json")).exists()).toBe(false);
});

test("inherit copies Codex's AGENTS.md and ~/.agents skills, and keeps ctxray's own config", async () => {
  const context = contextOf(true);
  const { env } = await launchCodex("codex", context);
  const codexHome = env["CODEX_HOME"] ?? "";
  expect(readFileSync(join(codexHome, "AGENTS.md"), "utf8")).toBe("codex user rules");
  expect(readFileSync(join(codexHome, "config.toml"), "utf8")).toContain('model_provider = "ctxray"');
  expect(await Bun.file(join(context.dirs.home, ".agents/skills/deploy/SKILL.md")).exists()).toBe(true);
});

test("inherit gives Gemini CLI the user's GEMINI.md, MCP servers behind the shim, and hooks, never their auth", async () => {
  const context = {
    ...contextOf(true),
    shim: async (name: string, command: readonly string[]) => ["shim", name, ...command],
  };
  await launchGeminiCli("gemini", context);
  const gemini = join(context.dirs.home, ".gemini");
  expect(readFileSync(join(gemini, "GEMINI.md"), "utf8")).toBe("gemini user rules");
  const settings = JSON.parse(readFileSync(join(gemini, "settings.json"), "utf8"));
  expect(settings.security.auth.selectedType).toBe("gemini-api-key");
  expect(settings.mcpServers).toEqual({ fs: { command: "shim", args: ["fs", "npx", "fs"] } });
  expect(settings.hooks).toEqual({ SessionStart: [] });
});

test("inherit gives OpenCode the user's AGENTS.md and MCP servers in the run's global config, nothing else", async () => {
  const context = { ...contextOf(true), remote: (name: string) => `http://127.0.0.1/m/${name}` };
  const { env, stdin } = await launchOpencode("opencode", context);
  const config = join(context.dirs.home, ".config/opencode");
  expect(readFileSync(join(config, "AGENTS.md"), "utf8")).toBe("opencode user rules");
  expect(JSON.parse(readFileSync(join(config, "opencode.json"), "utf8"))).toEqual({
    mcp: { notes: { type: "remote", url: "http://127.0.0.1/m/notes" } },
  });
  expect(JSON.parse(env["OPENCODE_CONFIG_CONTENT"] ?? "{}").model).toBe("ctxray/m");
  expect(stdin).toBe("hi");
});
