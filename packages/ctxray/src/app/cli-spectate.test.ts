import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runIn } from "./cli.fixture.ts";

// A HOME of its own: the user's real ~/.claude and ~/.cursor stay out of reach.
const home = mkdtempSync(join(tmpdir(), "ctxray-cli-spectate-"));
afterAll(() => rmSync(home, { recursive: true, force: true }));
const env = { HOME: home, CTXRAY_STATE_DIR: join(home, "state") };
const spectate = (...args: string[]) => runIn(home, ["spectate", ...args], env);

test("install, an empty show, and uninstall, in the user's files only", async () => {
  const installed = await spectate("install", "--harness", "claude-code");
  expect(installed.code).toBe(0);
  expect(installed.stdout).toContain("ctxray's hook on SessionStart, InstructionsLoaded");
  const settings = readFileSync(join(home, ".claude/settings.json"), "utf8");
  expect(settings).toContain("__spectate-hook");
  expect(settings).toContain(join(home, "state", "spectate"));
  expect((await spectate()).stdout).toContain("No sessions yet");
  const removed = await spectate("uninstall", "--harness", "claude-code");
  expect(removed.stdout).toContain("ctxray's hook removed from");
  expect(JSON.parse(readFileSync(join(home, ".claude/settings.json"), "utf8"))).toEqual({});
});

test("harnesses that keep their sessions themselves need no hooks", async () => {
  const { code, stdout } = await spectate("install", "--harness", "codex,gemini-cli");
  expect(code).toBe(0);
  expect(stdout).toContain("No hooks needed for Codex, Gemini CLI");
});
