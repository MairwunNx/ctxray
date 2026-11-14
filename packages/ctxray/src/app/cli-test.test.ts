import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runIn } from "./cli.fixture.ts";
import { registerUserModules } from "./user-modules.ts";

registerUserModules();

const FIXTURES = join(import.meta.dir, "../../fixtures");
const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

// The runner fixture with the payments project beside its tests, in a fresh repository of its own.
const copy = (extra: Record<string, string> = {}) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ctxray-cli-test-")));
  roots.push(root);
  // Symlinks as they are: Node otherwise points relative links back at the fixture.
  cpSync(join(FIXTURES, "runner"), root, { recursive: true, verbatimSymlinks: true });
  cpSync(join(FIXTURES, "static/payments"), join(root, "payments"), { recursive: true, verbatimSymlinks: true });
  for (const [path, text] of Object.entries(extra)) Bun.write(join(root, path), text);
  Bun.spawnSync(["git", "init", "-q"], { cwd: root });
  return root;
};

const shared = copy();
// A cache of its own: looking for a harness creates the cache folder, and the user's stays untouched.
const cache = join(shared, ".cache");
const run = (args: string[], root = shared, env: Record<string, string> = {}) =>
  runIn(root, ["test", ...args], { CTXRAY_CACHE_DIR: cache, ...env });

describe.each([
  ["en", ["ctxray checks", "payments rules attach to payment sources", "needs pathRules", "L6 doesn't run here yet"]],
  [
    "ru",
    ["проверки ctxray", "payments rules attach to payment sources", "нужно pathRules", "L6 здесь пока не запускается"],
  ],
])("the examples in %s", (lang, words) => {
  test("pass, with what can't run skipped and said why", async () => {
    const { code, stdout } = await run(["--lang", lang]);
    expect(code).toBe(0);
    for (const word of words) expect(stdout).toContain(word);
    expect(stdout).toContain(".claude/rules/payments.md attaches to matching files");
    expect(stdout).toMatch(/L3 ✓ 6/);
  });
});

test.each<[string, string[], Record<string, string>, RegExp]>([
  ["a layer and a filter", ["--layer", "L3", "--filter", "always"], {}, /L3 ✓ 2\n.*2 passed · 10 filtered/],
  [
    "a harness from the environment",
    ["--layer", "L1-L3"],
    { CTXRAY_HARNESS: "codex" },
    /1 harness.*codex ○ needs pathRules.*L3 ✓ 2/s,
  ],
])("%s", async (_, args, env, pattern) => {
  const { code, stdout } = await run(["--plain", ...args], shared, env);
  expect(code).toBe(0);
  expect(stdout).toMatch(pattern);
});

test("a failing test and a broken file fail the run and say where", async () => {
  const root = copy({
    "tests/broken.ctxray.ts": 'import { suite } from "@mairwunnx/ctxray";\nsuite("x", async () => {});\n',
    "tests/failing.ctxray.ts": [
      'import { expect, suite, test } from "@mairwunnx/ctxray";',
      'suite("wrong", { fixture: "../payments" }, () => {',
      '  test.resolve("web rules load", async ({ resolve }) => {',
      '    expect((await resolve()).rules).toInclude(".claude/rules/web.md");',
      "  });",
      "});",
    ].join("\n"),
  });
  const { code, stdout } = await run(["--harness", "claude-code"], root);
  expect(code).toBe(1);
  expect(stdout).toContain("✗ tests/broken.ctxray.ts  The file failed to load");
  expect(stdout).toContain("Suite “x” returns a promise");
  expect(stdout).toContain("✗ claude-code › wrong › web rules load");
  expect(stdout).toMatch(/Missing +\.claude\/rules\/web\.md/);
});

test("snapshots get written only when asked", async () => {
  const root = copy();
  rmSync(join(root, "tests/__snapshots__"), { recursive: true });
  const first = await run(["--layer", "L3"], root);
  expect(first.code).toBe(1);
  expect(first.stdout).toContain("ctxray test --update-snapshots writes the missing snapshots");
  const update = await run(["--layer", "L3", "-u"], root);
  expect(update.code).toBe(0);
  expect(update.stdout).toContain("2 written");
  expect((await run(["--layer", "L3"], root)).code).toBe(0);
});

test.each([
  ["an unknown harness", ["--harness", "vim"], "Unknown harness “vim”"],
  ["an unknown backend", ["--backend", "nightly"], "Unknown backend “nightly”. Known ones: mock, replay, real"],
  ["unreadable layers", ["--layer", "L9"], "Can't read layers “L9”"],
])("%s is a usage error", async (_, args, message) => {
  const { code, stdout } = await run(args);
  expect(code).toBe(2);
  expect(stdout).toContain(message);
});
