import { Database } from "bun:sqlite";
import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { HistoryRows } from "#entities/harness/index.ts";
import type { Component, HarnessId } from "#shared/contract/index.ts";
import { createTranslator } from "#shared/i18n/index.ts";
import { toPlain } from "#shared/render/index.ts";
import { sessionLoadoutView } from "./api/session-view.ts";
import { createSpectateSessionAction } from "./session.action.ts";
import { createSpectateShowAction } from "./show.action.ts";

// The three fixture sessions where each harness keeps them, in a home of their own, and the project they ran in.
const dir = mkdtempSync(join(tmpdir(), "ctxray-stored-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const work = join(dir, "shop");
const home = join(dir, "home");
const put = (path: string, text: string) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
};
const SKILL = "---\nname: refunds\ndescription: How to issue a refund in the shop\n---\n\nCall `refund()`.\n";
put(join(work, "AGENTS.md"), "# Shop\n\nRefunds never touch the ledger directly.\n");
put(join(work, "GEMINI.md"), "# Shop\n\nRefunds never touch the ledger directly.\n");
put(join(work, "src/payments/AGENTS.md"), "# Payments\n\nEvery amount is integer cents.\n");
put(join(work, "src/payments/charge.ts"), "export const charge = (cents: number) => cents;\n");
for (const root of [".agents", ".gemini", ".opencode"]) put(join(work, root, "skills/refunds/SKILL.md"), SKILL);
mkdirSync(join(work, ".git"));

const FIXTURES = join(import.meta.dir, "../../../fixtures/transcripts");
const fixture = async (name: string) => (await Bun.file(join(FIXTURES, name)).text()).replaceAll("<work>", work);
put(
  join(home, ".codex/sessions/2026/11/20/rollout-2026-11-20T14-29-50-01a1f95d-1aca-7ae1-9a5d-56e7096254d7.jsonl"),
  await fixture("codex-0.171.0.jsonl"),
);
put(
  join(home, ".gemini/tmp/shop/chats/session-2026-11-20T14-29-594c3bfd.jsonl"),
  await fixture("gemini-cli-0.70.0.jsonl"),
);
put(join(home, ".gemini/tmp/shop/.project_root"), work);

const rows = JSON.parse(await fixture("opencode-1.19.6.json")) as HistoryRows & { session: { id: string } };
mkdirSync(join(home, ".local/share/opencode"), { recursive: true });
const db = new Database(join(home, ".local/share/opencode/opencode.db"));
db.run("create table session (id, parent_id, directory, version, model, time_created, time_updated)");
db.run("create table message (id, session_id, time_created, data)");
db.run("create table part (id, message_id, session_id, time_created, data)");
db.query("insert into session values (?, null, ?, ?, ?, 1, 2)").run(
  rows.session.id,
  work,
  "1.19.6",
  rows.session.model,
);
const insert = (sql: string, values: (string | number | null)[][]) => {
  for (const row of values) db.query(sql).run(...row);
};
insert(
  "insert into message values (?, ?, ?, ?)",
  rows.messages.map((row, index) => [row.id, rows.session.id, index, row.data]),
);
insert(
  "insert into part values (?, ?, ?, ?, ?)",
  rows.parts.map((row, index) => [`p${index}`, row.message_id, rows.session.id, index, row.data]),
);
db.close();

const env = { HOME: home, CTXRAY_STATE_DIR: join(dir, "state") };
const session = createSpectateSessionAction(env);

test("every stored session shows up without hooks, the newest first", async () => {
  const { sessions } = await createSpectateShowAction(env)({ last: 5 });
  expect(sessions.map((one) => [one.harness, one.requests]).sort()).toEqual([
    ["codex", 3],
    ["gemini-cli", 3],
    ["opencode", 3],
  ]);
  const codex = sessions.find((one) => one.harness === "codex");
  expect(new Date(codex?.started ?? 0).toISOString()).toBe("2026-11-20T14:29:50.000Z");
});

test.each<[string, HarnessId, string[], Component[], Component[]]>([
  ["01a1f95d", "codex", ["AGENTS.md"], [], ["tools"]],
  ["594c3bfd", "gemini-cli", ["GEMINI.md"], ["skills"], ["system", "tools"]],
  ["ses_", "opencode", ["AGENTS.md", "src/payments/AGENTS.md"], ["rules", "skills"], ["system", "tools"]],
])("%s: %s's latest request, what its record leaves out told apart", async (id, harness, rules, filled, unseen) => {
  const result = await session(id, []);
  if (!result.found || !result.loadout) throw new Error("no loadout");
  expect([result.harness, result.requests, result.loadout.mode]).toEqual([harness, 3, "observe"]);
  expect(result.loadout.rules.map((rule) => rule.path)).toEqual(rules);
  expect([result.filled, result.unseen]).toEqual([filled, unseen]);
  expect(result.reported).toBeGreaterThan(result.loadout.tokens.total);
  const shown = toPlain(sessionLoadoutView(result, createTranslator("en")));
  expect(shown).toContain("The provider counted");
  expect(shown).not.toContain("Claude models");
});

test("--harness keeps the lookup to those harnesses", async () => {
  expect((await session("01a1f95d", [], ["opencode"])).found).toBe(false);
});

test("with ctxray's plugin, an OpenCode session has its system prompt, the tools alone unseen", async () => {
  const state = join(dir, "state", "spectate", "opencode");
  mkdirSync(state, { recursive: true });
  const system = [
    `You are OpenCode.\n\nInstructions from: ${work}/AGENTS.md\n# Shop\n\nRefunds never touch the ledger directly.\n`,
  ];
  writeFileSync(join(state, `${rows.session.id}.json`), JSON.stringify({ at: 1, system }));
  const result = await session("ses_", []);
  if (!result.found || !result.loadout) throw new Error("no loadout");
  expect([result.filled, result.unseen]).toEqual([[], ["tools"]]);
  expect(
    result.loadout.rules.map((rule) => [rule.path, result.loadout?.provenance[`rule:${rule.path}`]?.evidence]),
  ).toEqual([
    ["AGENTS.md", "marker"],
    ["src/payments/AGENTS.md", "marker"],
  ]);
});
