import { afterAll, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setupView } from "#features/mcp-serve/api/add-view.ts";
import { createTranslator } from "#shared/i18n/index.ts";
import { runIn } from "./cli.fixture.ts";

const root = realpathSync(mkdtempSync(join(tmpdir(), "ctxray-cli-mcp-")));
afterAll(() => rmSync(root, { recursive: true, force: true }));

let count = 0;
// A git project, a home of its own, and a PATH with only what a test puts there: no real config is touched.
const sandbox = () => {
  const dir = join(root, `case-${++count}`);
  for (const sub of ["project/.git", "home", "bin"]) mkdirSync(join(dir, sub), { recursive: true });
  const env = { HOME: join(dir, "home"), PATH: join(dir, "bin") };
  return { project: join(dir, "project"), home: env.HOME, bin: join(dir, "bin"), env };
};

test.each([
  ["claude-code", ".mcp.json", "mcpServers"],
  ["codex", ".codex/config.toml", "mcp_servers"],
  ["gemini-cli", ".gemini/settings.json", "mcpServers"],
  ["opencode", "opencode.json", "mcp"],
  ["cursor-cli", ".cursor/mcp.json", "mcpServers"],
])("--project connects %s in %s once, and keeps what was there", async (agent, file, key) => {
  const { project, env } = sandbox();
  const path = join(project, file);
  mkdirSync(join(path, ".."), { recursive: true });
  const toml = file.endsWith(".toml");
  writeFileSync(path, toml ? '[mcp_servers.jira]\ncommand = "jira-mcp"\n' : `{\n    "${key}": { "jira": {} }\n}\n`);
  const first = await runIn(project, ["mcp", "add", agent, "--project"], env);
  expect([first.code, first.stdout]).toEqual([0, expect.stringContaining(`Added ctxray to`)]);
  const text = await Bun.file(path).text();
  const config = (toml ? Bun.TOML.parse(text) : JSON.parse(text)) as Record<string, Record<string, unknown>>;
  expect(Object.keys(config[key] ?? {})).toEqual(["jira", "ctxray"]);
  if (!toml) expect(text).toStartWith(`{\n    "${key}"`);
  const second = await runIn(project, ["mcp", "add", agent, "--project"], env);
  expect(second.stdout).toContain(`already has ctxray in ${file}: nothing changed`);
  expect(await Bun.file(path).text()).toBe(text);
});

test.each([
  ["opencode", ".config/opencode/opencode.json", '"type": "local"'],
  ["cursor-cli", ".cursor/mcp.json", '"command": "ctxray"'],
])("%s gets ctxray in ~/%s", async (agent, file, entry) => {
  const { project, home, env } = sandbox();
  const result = await runIn(project, ["mcp", "add", agent], env);
  expect(result.stdout).toContain(`in ~/${file}`);
  expect(await Bun.file(join(home, file)).text()).toContain(entry);
});

test.each([
  [
    "claude-code",
    "claude",
    "mcp add --scope user ctxray -- ctxray mcp",
    ".claude.json",
    '{ "mcpServers": { "ctxray": {} } }',
  ],
  [
    "codex",
    "codex",
    "mcp add ctxray -- ctxray mcp",
    ".codex/config.toml",
    "[mcp_servers.ctxray]\ncommand = 'ctxray'\n",
  ],
  [
    "gemini-cli",
    "gemini",
    "mcp add --scope user ctxray ctxray mcp",
    ".gemini/settings.json",
    '{ "mcpServers": { "ctxray": {} } }',
  ],
])("%s connects through its own `%s mcp add`, unless ctxray is there", async (agent, binary, args, file, config) => {
  const { project, home, bin, env } = sandbox();
  const log = join(home, "calls.log");
  writeFileSync(join(bin, binary), `#!/bin/sh\necho "$@" >> "${log}"\n`);
  chmodSync(join(bin, binary), 0o755);
  const ran = await runIn(project, ["mcp", "add", agent], env);
  expect([ran.code, ran.stdout]).toEqual([0, expect.stringContaining(`Connected ctxray to`)]);
  expect(await Bun.file(log).text()).toBe(`${args}\n`);
  mkdirSync(join(home, file, ".."), { recursive: true });
  writeFileSync(join(home, file), config);
  const again = await runIn(project, ["mcp", "add", agent, "--lang", "ru"], env);
  expect(again.stdout).toContain("ctxray уже есть");
  expect(await Bun.file(log).text()).toBe(`${args}\n`);
});

test.each<[string, string[], number, string]>([
  ["an agent missing from PATH", ["mcp", "add", "codex"], 4, "codex isn't on PATH: install Codex"],
  ["an unknown agent", ["mcp", "add", "cursor"], 2, "Name the agent to connect"],
  ["no agent", ["mcp", "add"], 2, "Name the agent to connect"],
  ["an unknown subcommand", ["mcp", "remove"], 2, "Unknown subcommand “remove”"],
])("%s fails", async (_, args, code, message) => {
  const { project, env } = sandbox();
  const result = await runIn(project, args, env);
  expect(result.code as number).toBe(code);
  expect(result.stdout + result.stderr).toContain(message);
});

test("a config with comments stays as it is, with the entry to add by hand", async () => {
  const { project, env } = sandbox();
  const text = '{\n  // mine\n  "mcp": {}\n}\n';
  writeFileSync(join(project, "opencode.jsonc"), text);
  const result = await runIn(project, ["mcp", "add", "opencode", "--project"], env);
  expect(result.code).toBe(4);
  expect(result.stdout).toContain(
    'Add this under “mcp” by hand: {"ctxray":{"type":"local","command":["ctxray","mcp"]}}',
  );
  expect(await Bun.file(join(project, "opencode.jsonc")).text()).toBe(text);
});

test("ctxray mcp in a terminal names the command for each agent", () => {
  const text = setupView(createTranslator("en"))
    .map((line) => line.map((one) => one.text).join(""))
    .join("\n");
  for (const agent of ["claude-code", "codex", "gemini-cli", "opencode", "cursor-cli"])
    expect(text).toContain(`ctxray mcp add ${agent}`);
});
