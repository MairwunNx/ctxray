import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claudeBuilds, codexBuilds, startFakeRegistry } from "#fixtures/registry/fake-registry.ts";
import { runIn } from "./cli.fixture.ts";
import { registerUserModules } from "./user-modules.ts";

const root = mkdtempSync(join(tmpdir(), "ctxray-cli-harness-"));
const registry = await startFakeRegistry(
  [...claudeBuilds("2.1.311"), ...codexBuilds("0.168.0"), ...codexBuilds("0.169.0")],
  {
    tags: { "@anthropic-ai/claude-code": { stable: "2.1.311" } },
    token: "s3cret",
  },
);
beforeAll(registerUserModules);
afterAll(() => {
  registry.stop();
  rmSync(root, { recursive: true, force: true });
});

let count = 0;
// A project whose .npmrc points at the fake registry with a token from the environment, and a cache of its own.
const project = (config: string) => {
  const dir = join(root, `project-${++count}`);
  mkdirSync(join(dir, "home"), { recursive: true });
  writeFileSync(join(dir, "ctxray.config.jsonc"), config);
  const host = new URL(registry.url).host;
  writeFileSync(join(dir, ".npmrc"), `registry=${registry.url}\n//${host}/:_authToken=\${REGISTRY_TOKEN}\n`);
  const env = {
    PATH: process.env["PATH"] ?? "",
    HOME: join(dir, "home"),
    CTXRAY_CACHE_DIR: join(dir, "cache"),
    REGISTRY_TOKEN: "s3cret",
  };
  return { dir, env };
};

test("add pins, install installs once, and a second install takes the cache", async () => {
  const { dir, env } = project(`{ "harnesses": { "codex": { "version": "0.168.x" }, "claude-code": {} } }`);
  const added = await runIn(dir, ["harness", "add", "codex", "claude-code"], env);
  expect(added.code).toBe(0);
  expect(added.stdout).toContain("codex        0.168.0 (0.168.x)  added");
  expect(added.stdout).toContain("claude-code  2.1.311 (stable)   added");
  const first = await runIn(dir, ["harness", "install"], env);
  expect(first.code).toBe(0);
  expect(first.stdout).toMatch(/✓ {2}claude-code {2}2\.1\.311 {2}installed in/);
  const downloads = registry.downloads.length;
  const second = await runIn(dir, ["harness", "install"], env);
  expect(second.stdout).toContain("✓  codex        0.168.0  in the cache");
  expect(registry.downloads.length).toBe(downloads);
  const listed = await runIn(dir, ["harness", "list"], env);
  expect(listed.stdout).toContain(" codex        0.168.0 (0.168.x)  in the cache");
});

test("frozen, and so in CI, a lockfile behind the config stops before any download", async () => {
  const { dir, env } = project(`{ "harnesses": { "codex": { "version": "0.168.x" } } }`);
  await runIn(dir, ["harness", "add", "codex"], env);
  writeFileSync(join(dir, "ctxray.config.jsonc"), `{ "harnesses": { "codex": { "version": "0.169.x" } } }`);
  const downloads = registry.downloads.length;
  const frozen = await runIn(dir, ["harness", "install", "--lang", "ru"], { ...env, CI: "true" });
  expect(frozen.code).toBe(4);
  expect(frozen.stdout).toContain("В ctxray.lock codex 0.168.x, а конфиг просит 0.169.x");
  expect(registry.downloads.length).toBe(downloads);
  expect((await runIn(dir, ["harness", "install", "--ci"], env)).code).toBe(4);
  const local = await runIn(dir, ["harness", "install"], env);
  expect(local.code).toBe(0);
  expect(local.stdout).toContain("! ctxray.lock has codex 0.168.x, the config asks for 0.169.x");
});

test("pack, then install from the archive with the network off", async () => {
  const { dir, env } = project(`{ "harnesses": { "codex": {} } }`);
  await runIn(dir, ["harness", "add", "codex@0.169.0"], env);
  const archive = join(dir, "harnesses.tar");
  const packed = await runIn(dir, ["harness", "pack", "-o", archive, "--platform", "all"], env);
  expect(packed.code).toBe(0);
  expect(packed.stdout).toContain("Packed 6 builds into");
  const offline = { ...env, CTXRAY_OFFLINE: "1", CTXRAY_CACHE_DIR: join(dir, "air-gapped") };
  const blocked = await runIn(dir, ["harness", "install"], offline);
  expect([blocked.code, blocked.stdout]).toEqual([4, expect.stringContaining("Offline mode")]);
  const installed = await runIn(dir, ["harness", "install", "--from", archive], offline);
  expect(installed.code).toBe(0);
  expect(installed.stdout).toContain("✓  codex  0.169.0  installed in");
});

test.each<[string[], number, string]>([
  [["harness"], 2, "`ctxray harness` needs a subcommand"],
  [["harness", "drop"], 2, "Unknown subcommand “drop” of `ctxray harness`"],
  [["harness", "remove"], 2, "Name the harnesses to remove"],
  [["harness", "remove", "cursor"], 2, "Unknown harness “cursor”"],
  [["harness", "add"], 2, "Name the harnesses to add"],
  [["harness", "add", "cursor"], 2, "Unknown harness “cursor”"],
  [["harness", "pack"], 4, "There's no"],
])("%p fails with %i", async (args, code, text) => {
  const { dir, env } = project("{}");
  const result = await runIn(dir, args, env);
  expect(result.code as number).toBe(code);
  expect(result.stdout + result.stderr).toContain(text);
});

test("the cache: its folder for CI, its builds, and a prune that keeps what the lockfile pins", async () => {
  const { dir, env } = project(`{ "harnesses": { "codex": {}, "claude-code": {} } }`);
  expect((await runIn(dir, ["cache", "dir"], env)).stdout).toBe(`${env.CTXRAY_CACHE_DIR}\n`);
  await runIn(dir, ["harness", "add", "codex@0.168.0", "claude-code"], env);
  await runIn(dir, ["harness", "install"], env);
  await runIn(dir, ["harness", "add", "codex@0.169.0"], env);
  await runIn(dir, ["harness", "install"], env);
  const listed = await runIn(dir, ["cache", "ls"], env);
  expect(listed.stdout).toContain("3 builds");
  expect((await runIn(dir, ["cache", "prune"], env)).stdout).toContain("Nothing to prune");
  const pruned = await runIn(dir, ["cache", "prune", "--all"], env);
  expect(pruned.stdout).toContain("− codex 0.168.0");
  expect(pruned.stdout).toContain("Removed 1 build");
  expect((await runIn(dir, ["cache", "prune", "--older-than", "soon"], env)).code).toBe(2);
});

test("remove unpins, keeps the rest, and names the config that still asks for it", async () => {
  const { dir, env } = project(`{ "harnesses": { "codex": {} } }`);
  await runIn(dir, ["harness", "add", "codex@0.169.0", "claude-code"], env);
  const removed = await runIn(dir, ["harness", "remove", "claude-code", "codex", "opencode"], env);
  expect(removed.code).toBe(0);
  expect(removed.stdout).toMatch(/− {2}claude-code {2}2\.1\.311 \(stable\) {2}removed/);
  expect(removed.stdout).toMatch(/· {2}opencode {2,}not in ctxray\.lock/);
  expect(removed.stdout).toContain("! ctxray.config.jsonc still names codex");
  expect(await Bun.file(join(dir, "ctxray.lock")).json()).toEqual({ lockfileVersion: 1, harnesses: {} });
  const again = await runIn(dir, ["harness", "remove", "codex", "--lang", "ru"], env);
  expect(again.stdout).toMatch(/· {2}codex {2,}нет в ctxray\.lock/);
  expect(again.stdout).not.toContain("Записан");
});

test("cache clear shows what would go, and removes pinned builds too only with --yes", async () => {
  const { dir, env } = project(`{ "harnesses": { "codex": {} } }`);
  expect(await runIn(dir, ["cache", "clear"], env)).toMatchObject({
    code: 0,
    stdout: expect.stringContaining("No harnesses"),
  });
  await runIn(dir, ["harness", "add", "codex@0.169.0"], env);
  await runIn(dir, ["harness", "install"], env);
  const asked = await runIn(dir, ["cache", "clear"], env);
  expect(asked.code).toBe(2);
  expect(asked.stdout).toContain("This removes 1 build");
  expect((await runIn(dir, ["cache", "ls"], env)).stdout).toContain("1 build");
  const cleared = await runIn(dir, ["cache", "clear", "-y"], env);
  expect([cleared.code, cleared.stdout]).toEqual([0, expect.stringContaining("Removed 1 build")]);
  expect((await runIn(dir, ["cache", "ls"], env)).stdout).toContain("No harnesses in the cache yet");
});

test("doctor finds the pinned harnesses and the registry", async () => {
  const { dir, env } = project(`{ "harnesses": { "codex": {} } }`);
  await runIn(dir, ["harness", "add", "codex@0.169.0"], env);
  const before = await runIn(dir, ["doctor"], env);
  expect(before.code).toBe(0);
  expect(before.stdout).toContain(`✓ npm registry ${registry.url} answers (`);
  expect(before.stdout).toContain("! codex 0.169.0 isn't installed yet");
  await runIn(dir, ["harness", "install"], env);
  expect((await runIn(dir, ["doctor"], env)).stdout).toContain("✓ codex 0.169.0 installed");
});
