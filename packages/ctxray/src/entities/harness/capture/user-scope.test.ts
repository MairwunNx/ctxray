import { afterAll, expect, test } from "bun:test";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchClaudeCode } from "../claude-code/launch.ts";
import { launchCodex } from "../codex/launch.ts";
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
