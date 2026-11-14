import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HarnessSettings, Lockfile } from "#shared/contract/index.ts";
import { formatLockfile, lockfilePath, lockProblems, readLockfile } from "./lockfile.ts";

const root = mkdtempSync(join(tmpdir(), "ctxray-lockfile-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const LOCK: Lockfile = {
  lockfileVersion: 1,
  harnesses: {
    codex: {
      source: "registry",
      range: "0.169.x",
      version: "0.169.0",
      platforms: {
        "linux-x64-glibc": { package: "@openai/codex@0.169.0-linux-x64", integrity: "sha512-b" },
        "darwin-arm64": { package: "@openai/codex@0.169.0-darwin-arm64", integrity: "sha512-a" },
      },
    },
    "claude-code": { source: "system", version: "2.1.311" },
  },
};

test("the format is stable: harnesses by name, platforms in a fixed order", async () => {
  const text = formatLockfile(LOCK);
  expect(text.indexOf('"claude-code"')).toBeLessThan(text.indexOf('"codex"'));
  expect(text.indexOf("darwin-arm64")).toBeLessThan(text.indexOf("linux-x64-glibc"));
  const path = join(root, "ctxray.lock");
  writeFileSync(path, text);
  expect(await readLockfile(path)).toEqual(LOCK);
});

test.each<[string, string, string]>([
  ["not JSON", "{", "lock.unreadable"],
  ["a wrong shape", '{"lockfileVersion":1,"harnesses":{"codex":{"source":"git"}}}', "lock.invalid"],
])("a lockfile that's %s", async (_, text, key) => {
  const path = join(root, `${key}.lock`);
  writeFileSync(path, text);
  await expect(readLockfile(path)).rejects.toMatchObject({ problem: { key } });
});

test("no lockfile reads as none", async () => {
  expect(await readLockfile(join(root, "missing.lock"))).toBeUndefined();
});

test("the lockfile sits next to the project's config", () => {
  expect(lockfilePath(["/org/base.ts", "/repo/ctxray.config.ts"], "/repo/app")).toBe("/repo/ctxray.lock");
  expect(lockfilePath([], "/repo/app")).toBe("/repo/app/ctxray.lock");
});

test.each<[string, Partial<Record<string, HarnessSettings>>, string[]]>([
  ["matching", { codex: { version: "0.169.x" }, "claude-code": { source: "system" } }, []],
  ["no settings at all", {}, ["lock.sourceChanged claude-code"]],
  [
    "another range",
    { codex: { version: "0.170.x" }, "claude-code": { source: "system" } },
    ["lock.rangeChanged codex"],
  ],
  ["from PATH now", { codex: { source: "system" }, "claude-code": { source: "system" } }, ["lock.sourceChanged codex"]],
])("config and lockfile: %s", (_, settings, expected) => {
  const problems = lockProblems(LOCK, ["codex", "claude-code"], (harness) => settings[harness]);
  expect(problems.map((problem) => `${problem.key} ${problem.params["harness"]}`)).toEqual(expected);
});

test("a harness the lockfile doesn't have", () => {
  const problems = lockProblems(undefined, ["codex", "claude-code"], (harness) =>
    harness === "codex" ? undefined : { source: "system" },
  );
  expect(problems.map((problem) => problem.key)).toEqual(["lock.missing", "lock.missingSystem"]);
});
