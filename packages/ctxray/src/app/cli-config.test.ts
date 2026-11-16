import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runIn } from "./cli.fixture.ts";
import { registerUserModules } from "./user-modules.ts";

const roots: string[] = [];
const project = (files: Record<string, string>) => {
  const root = mkdtempSync(join(tmpdir(), "ctxray-cli-config-"));
  roots.push(root);
  for (const [path, text] of Object.entries(files)) writeFileSync(join(root, path), text);
  return root;
};
beforeAll(registerUserModules);
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test("the config init writes loads through the binary's own API", async () => {
  const cwd = project({});
  expect((await runIn(cwd, ["init"])).code).toBe(0);
  const { code, stdout } = await runIn(cwd, ["config"]);
  expect(code).toBe(0);
  expect(stdout).toStartWith("Config: ctxray.config.ts\n");
  expect(stdout).toContain('"claude-code": {}');
});

test("without a config the defaults show", async () => {
  const { code, stdout } = await runIn(project({}), ["config", "--lang", "ru"]);
  expect(code).toBe(0);
  expect(stdout).toStartWith("Файла конфига нет, действуют значения по умолчанию\n");
});

test("a broken config stops with exit code 3 and says where", async () => {
  const cwd = project({ "ctxray.config.jsonc": `{ "reporters": ["xml"], "harness": {} }` });
  const { code, stdout, stderr } = await runIn(cwd, ["config", "--lang", "ru"]);
  expect([code, stdout]).toEqual([3, ""]);
  expect(stderr).toStartWith("ctxray: В конфиге ошибки, ctxray остановился:\n  ctxray.config.jsonc → reporters[0]: ");
  expect(stderr).toContain("  ctxray.config.jsonc: Нераспознанный ключ");
});

test("the config's language applies when nothing else names one", async () => {
  const cwd = project({ "ctxray.config.jsonc": `{ "lang": "ru" }` });
  expect((await runIn(cwd, ["config"])).stdout).toStartWith("Конфиг: ctxray.config.jsonc\n");
  expect((await runIn(cwd, ["config"], { CTXRAY_LANG: "en" })).stdout).toStartWith("Config: ctxray.config.jsonc\n");
});

test("passwords in URLs never show", async () => {
  const cwd = project({ "ctxray.config.jsonc": `{ "network": { "proxy": "http://ivan:s3cr3t@proxy:3128" } }` });
  const { stdout } = await runIn(cwd, ["config"]);
  expect(stdout).not.toContain("s3cr3t");
  expect(stdout).toContain("@proxy:3128");
});

test("--config points at another file", async () => {
  const cwd = project({ "ci.jsonc": `{ "offline": true }` });
  const { stdout } = await runIn(cwd, ["config", "--config", "ci.jsonc"]);
  expect(stdout).toContain('"offline": true');
});

// Offline, nothing leaves the machine: not a real model's run, not a provider's token count.
test.each([
  [["test", "--backend", "real"], "--backend real asks a model, and ctxray is offline"],
  [["calibrate", "--provider", "anthropic", "--model", "claude-sonnet-5-5"], "Calibrating counts tokens"],
])("offline, %p stops before the network", async (args, message) => {
  const { code, stdout } = await runIn(project({ "ctxray.config.jsonc": `{ "offline": true }` }), args);
  expect(code).toBe(4);
  expect(stdout).toContain(message);
});
