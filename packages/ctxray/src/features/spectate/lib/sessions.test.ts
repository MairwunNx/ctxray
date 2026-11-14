import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lineOf, runSpectateHook } from "./hook.ts";
import { readSessions } from "./sessions.ts";

const dir = mkdtempSync(join(tmpdir(), "ctxray-spectate-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const hook = (family: string, payload: object | string, env: Record<string, string> = {}) =>
  runSpectateHook([family, dir], typeof payload === "string" ? payload : JSON.stringify(payload), env);

test("a prompt's text never reaches the log, its length does", () => {
  const line = lineOf("claude", { hook_event_name: "UserPromptSubmit", prompt: "deploy with key sk-123" }, {});
  expect(line["prompt_length"]).toBe(22);
  expect(JSON.stringify(line)).not.toContain("deploy");
});

test("sessions from both logs, newest first, each harness told apart", async () => {
  const claude = { session_id: "a", cwd: "/repo" };
  await hook("claude", { ...claude, hook_event_name: "SessionStart" }, { CLAUDE_CODE_ENTRYPOINT: "sdk-ts" });
  await hook("claude", {
    ...claude,
    hook_event_name: "InstructionsLoaded",
    file_path: "/repo/CLAUDE.md",
    load_reason: "session_start",
  });
  await hook("claude", {
    ...claude,
    hook_event_name: "InstructionsLoaded",
    file_path: "/repo/app/CLAUDE.md",
    load_reason: "nested_traversal",
    trigger_file_path: "/repo/app/x.kt",
  });
  await hook("claude", { ...claude, hook_event_name: "UserPromptSubmit", prompt: "hi" });
  await Bun.sleep(5);
  const cursor = { conversation_id: "b", workspace_roots: ["/repo"], cursor_version: "3.29.9" };
  await hook("cursor", { ...cursor, hook_event_name: "beforeReadFile", file_path: "/repo/src/a.ts" });
  await hook("cursor", { ...cursor, hook_event_name: "beforeReadFile", file_path: "/repo/src/a.ts" });
  await hook("cursor", "not json");
  const sessions = await readSessions(dir);
  expect(sessions.map((one) => [one.harness, one.id, one.cwd])).toEqual([
    ["cursor-ide", "b", "/repo"],
    ["claude-code-desktop", "a", "/repo"],
  ]);
  expect(sessions[0]?.read).toEqual(["/repo/src/a.ts"]);
  expect(sessions[1]?.prompts).toBe(1);
  expect(sessions[1]?.loaded).toEqual([
    { path: "/repo/CLAUDE.md", reason: "session_start" },
    { path: "/repo/app/CLAUDE.md", reason: "nested_traversal", trigger: "/repo/app/x.kt" },
  ]);
});

test("a hook for something else, or without a folder, does nothing and never fails", async () => {
  expect(await runSpectateHook(["codex", dir], "{}", {})).toBe(0);
  expect(await runSpectateHook(["claude"], "{}", {})).toBe(0);
});
