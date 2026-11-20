import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTranslator } from "#shared/i18n/index.ts";
import { toPlain } from "#shared/render/index.ts";
import { sessionLoadoutView } from "./api/session-view.ts";
import { createSessionAction } from "./session.action.ts";

// The transcript fixture's session, in a project laid out the way it was, under Claude Code's projects folder.
const ID = "522c5825-66ed-4532-932d-049475ddcd42";
const dir = mkdtempSync(join(tmpdir(), "ctxray-session-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const work = join(dir, "proj");
mkdirSync(join(work, "app"), { recursive: true });
writeFileSync(join(work, "CLAUDE.md"), "# Proj\n");
writeFileSync(join(work, "app", "CLAUDE.md"), "# App rules\n");
writeFileSync(join(work, "app", "Main.kt"), "fun main() {}\n");
const fixture = join(import.meta.dir, "../../../fixtures/transcripts/claude-code-2.1.311.jsonl");
mkdirSync(join(dir, "claude", "projects", "-work"), { recursive: true });
const transcript = (await Bun.file(fixture).text()).replaceAll("<work>", work);
writeFileSync(join(dir, "claude", "projects", "-work", `${ID}.jsonl`), transcript);

const env = { HOME: dir, CLAUDE_CONFIG_DIR: join(dir, "claude"), CTXRAY_STATE_DIR: join(dir, "state") };
const session = createSessionAction(env);

test("a live session's loadout, with ctxray's own plugin listed apart", async () => {
  const result = await session(ID, ["<plugin>"]);
  if (!result.found || !result.loadout) throw new Error("no loadout");
  const { loadout } = result;
  expect([result.requests, loadout.mode, loadout.harness.version]).toEqual([3, "observe", "2.1.311"]);
  expect(loadout.rules.map(({ path, reason }) => [path, reason])).toEqual([
    ["CLAUDE.md", "cwd"],
    ["app/CLAUDE.md", "nested:app/Main.kt"],
  ]);
  expect(loadout.skills.loaded.map(({ name, own }) => [name, own])).toEqual([["ctxray", true]]);
  expect(loadout.mcp.servers.filter(({ own }) => own).map(({ name }) => name)).toEqual(["plugin_ctxray_ctxray"]);
  expect(loadout.tokens.own).toBeGreaterThan(0);
  const shown = toPlain(sessionLoadoutView(result, createTranslator("en")));
  expect(shown).toContain("ctxray itself");
  expect(shown).not.toContain("plugin_ctxray_ctxray");
});

test("a session nobody knows", async () => {
  const result = await session("nope", []);
  expect(result).toEqual({ found: false, id: "nope" });
  expect(toPlain(sessionLoadoutView(result, createTranslator("en")))).toContain("No session nope");
});

test("the plugin's own session before its first request", async () => {
  const result = await session("fresh", ["<plugin>"]);
  expect(toPlain(sessionLoadoutView(result, createTranslator("en"), true))).toContain("hasn't sent the model anything");
});
