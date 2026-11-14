import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Inspection } from "#shared/contract/index.ts";
import { widthOf } from "#shared/render/index.ts";
import { runIn } from "./cli.fixture.ts";

const root = realpathSync(mkdtempSync(join(tmpdir(), "ctxray-cli-inspect-")));
cpSync(join(import.meta.dir, "../../fixtures/static/payments"), root, { recursive: true });
Bun.spawnSync(["git", "init", "-q"], { cwd: root });
afterAll(() => rmSync(root, { recursive: true, force: true }));

const run = (args: string[]) => runIn(root, ["inspect", ...args]);

// Where each token count ends, in display columns: right-aligned counts all end in one column.
const countEnds = (stdout: string) =>
  stdout.split("\n").flatMap((line) => {
    const match = /≈ [\d\s,.]*\d/u.exec(line);
    return match ? [widthOf(line.slice(0, match.index + match[0].length))] : [];
  });

describe.each([
  ["en", ["Rules", "Skills", "MCP servers", "after a run"]],
  ["ru", ["Правила", "Скиллы", "MCP-серверы", "после запуска"]],
])("inspect in %s", (lang, words) => {
  test("shows every section in the language", async () => {
    const { code, stdout } = await run(["--lang", lang]);
    expect(code).toBe(0);
    for (const word of words) expect(stdout).toContain(word);
  });

  test("lines token counts up on the right", async () => {
    const { stdout } = await run(["--lang", lang, "--harness", "claude-code"]);
    const ends = countEnds(stdout);
    expect(ends.length).toBeGreaterThan(5);
    expect(new Set(ends).size).toBe(1);
  });
});

test("--json prints the Inspection contract", async () => {
  const { code, stdout } = await run(["--json", "--cwd", "app", "--files", "app/src/main/kotlin/payments/Charge.kt"]);
  expect(code).toBe(0);
  const inspection = Inspection.parse(JSON.parse(stdout));
  expect(inspection.harnesses.map((harness) => harness.cwd)).toEqual(["app", "app"]);
  expect(inspection.harnesses[0]?.problems[0]).toMatchObject({ severity: "warning", key: expect.any(String) });
});

test.each([
  ["an unknown harness", ["--harness", "vim"], "Unknown harness “vim”"],
  ["a missing folder", ["--cwd", "nowhere"], "Folder nowhere doesn't exist"],
])("%s is a usage error", async (_, args, message) => {
  const { code, stdout } = await run(args);
  expect(code).toBe(2);
  expect(stdout).toContain(message);
});
