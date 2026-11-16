import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInitAction } from "./init.action.ts";
import { CONFIG_PATH, TEST_PATH } from "./templates.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const project = async (files: Record<string, string>) => {
  const cwd = mkdtempSync(join(tmpdir(), "ctxray-init-"));
  dirs.push(cwd);
  for (const [path, content] of Object.entries(files)) await Bun.write(join(cwd, path), content);
  return cwd;
};
const read = (cwd: string, path: string) => Bun.file(join(cwd, path)).text();

test("creates the config and the example test", async () => {
  const cwd = await project({});
  expect(await createInitAction(cwd)({ force: false })).toEqual([
    { path: CONFIG_PATH, outcome: "created" },
    { path: TEST_PATH, outcome: "created" },
  ]);
  expect(await read(cwd, CONFIG_PATH)).toContain("defineConfig");
});

// Claude Code reads CLAUDE.md and Codex reads AGENTS.md: the example expects each harness's own file.
test.each(['"claude-code": "CLAUDE.md"', 'codex: "AGENTS.md"'])("the example expects %s", async (pair) => {
  const cwd = await project({});
  await createInitAction(cwd)({ force: false });
  expect(await read(cwd, TEST_PATH)).toContain(pair);
});

describe("existing files", () => {
  test.each([
    [false, "exists", "mine"],
    [true, "overwritten", "defineConfig"],
  ])("force %p leaves the config %s", async (force, outcome, content) => {
    const cwd = await project({ [CONFIG_PATH]: "mine" });
    const [config] = await createInitAction(cwd)({ force });
    expect(config).toEqual({ path: CONFIG_PATH, outcome: outcome as "exists" | "overwritten" });
    expect(await read(cwd, CONFIG_PATH)).toContain(content);
  });
});

describe(".gitignore", () => {
  test.each([
    ["node_modules/\n", "ignoreAdded", "node_modules/\n.ctxray/\n"],
    ["node_modules/", "ignoreAdded", "node_modules/\n.ctxray/\n"],
    ["", "ignoreAdded", ".ctxray/\n"],
    ["dist/\r\n.ctxray/\r\n", "ignorePresent", "dist/\r\n.ctxray/\r\n"],
    ["/.ctxray/\n", "ignorePresent", "/.ctxray/\n"],
    [".ctxray\n", "ignorePresent", ".ctxray\n"],
  ])("%p becomes %s", async (before, outcome, after) => {
    const cwd = await project({ ".gitignore": before });
    const steps = await createInitAction(cwd)({ force: false });
    expect(steps.at(-1)).toEqual({ path: ".gitignore", outcome: outcome as "ignoreAdded" | "ignorePresent" });
    expect(await read(cwd, ".gitignore")).toBe(after);
  });

  test("a missing .gitignore stays missing", async () => {
    const cwd = await project({});
    await createInitAction(cwd)({ force: false });
    expect(await Bun.file(join(cwd, ".gitignore")).exists()).toBe(false);
  });
});
