import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";
import { runIn } from "./cli.fixture.ts";
import { registerUserModules } from "./user-modules.ts";

const root = realpathSync(mkdtempSync(join(tmpdir(), "ctxray-cli-diff-")));
const report = join(root, ".ctxray/report/report.json");
beforeAll(async () => {
  registerUserModules();
  await Bun.write(join(root, "CLAUDE.md"), "Use Kotlin.\n");
  await Bun.write(join(root, ".claude/rules/old.md"), "Old rule.\n");
  await $`git -C ${root} init -q`.quiet();
  const run = await runIn(root, ["test", "--harness", "claude-code", "--layer", "L3", "--reporter", "json"]);
  expect(run.code).toBe(0);
  await Bun.write(join(root, "CLAUDE.md"), "Use Kotlin. Write tests for every change, and keep them fast.\n");
  rmSync(join(root, ".claude/rules/old.md"));
  await Bun.write(join(root, ".claude/rules/new.md"), "New rule.\n");
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

test("the saved report keeps what L3 predicted, and diff --file compares the project with it", async () => {
  const saved = await Bun.file(report).json();
  expect(saved.harnesses[0].loadout.items.rules.map((rule: { id: string }) => rule.id)).toContain("CLAUDE.md");
  const { code, stdout } = await runIn(root, ["diff", "--file", ".ctxray/report/report.json"]);
  expect(code).toBe(0);
  expect(stdout).toMatch(/Against \.ctxray\/report\/report\.json of \d{4}-\d\d-\d\d \d\d:\d\d UTC/);
  expect(stdout).toContain("~ CLAUDE.md");
  expect(stdout).toContain("+ .claude/rules/new.md");
  expect(stdout).toContain("− .claude/rules/old.md");
  expect(stdout).toContain("Wrote .ctxray/report/diff.html and .ctxray/report/diff.json");
  const json = await Bun.file(join(root, ".ctxray/report/diff.json")).json();
  expect(json.diffs.map((one: { harness: string }) => one.harness)).toEqual(["claude-code"]);
  const html = await Bun.file(join(root, ".ctxray/report/diff.html")).text();
  expect(html).toContain('"tests":[]');
  expect(html).toContain(".claude/rules/new.md");
});

test("--json prints the same diff, and a harness the report lacks gets a warning", async () => {
  const printed = await runIn(root, ["diff", "--file", report, "--json"]);
  expect(JSON.parse(printed.stdout).diffs[0].diff.changes).toHaveLength(3);
  const codex = await runIn(root, ["diff", "--file", report, "--harness", "claude-code,codex", "--lang", "ru"]);
  expect(codex.stdout).toContain("нет loadout codex");
});

test.each<[string, string | undefined, string[], string]>([
  ["a missing file", undefined, ["--file", "gone.json"], "There's no gone.json"],
  ["not a report", '{ "hello": 1 }', ["--file", "x.json"], "x.json isn't a report.json ctxray wrote"],
  ["a report of 0.1.0", "old", ["--file", "x.json"], "x.json holds no loadout: ctxray 0.1.0 didn't keep one"],
  ["both bases", undefined, ["--file", "x.json", "--base", "HEAD"], "with --base or with --file, not both"],
])("%s is a usage error", async (_, content, args, message) => {
  if (content === "old") {
    const saved = await Bun.file(report).json();
    for (const harness of saved.harnesses) delete harness.loadout;
    await Bun.write(join(root, "x.json"), JSON.stringify({ ...saved, ctxray: "0.1.0" }));
  } else if (content !== undefined) await Bun.write(join(root, "x.json"), content);
  const { code, stdout } = await runIn(root, ["diff", ...args]);
  expect(code).toBe(2);
  expect(stdout).toContain(message);
});
