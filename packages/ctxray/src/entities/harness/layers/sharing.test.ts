import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { $ } from "bun";
import { openProject } from "../project.ts";
import { checkSharing } from "./sharing.ts";

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

type Setup = { committed?: Record<string, string>; loose?: Record<string, string>; links?: Record<string, string> };

// A git repository with some files committed, some left loose, and some symlinks, read for Claude Code.
const findings = async ({ committed = {}, loose = {}, links = {} }: Setup) => {
  const root = mkdtempSync(join(tmpdir(), "ctxray-sharing-"));
  roots.push(root);
  const write = (files: Record<string, string>) => {
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    }
  };
  write(committed);
  await $`git init -q && git add -A && git -c user.name=t -c user.email=t@t commit -qm init --allow-empty`
    .cwd(root)
    .quiet();
  write(loose);
  for (const [path, target] of Object.entries(links)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    symlinkSync(target, join(root, path));
  }
  const found = await checkSharing(await openProject(root), ["claude-code"]);
  return (found["claude-code"] ?? []).map(({ key, path, params }) => `${key} ${path} ${params["count"] ?? ""}`.trim());
};

test.each<[string, Setup, string[]]>([
  ["a committed file", { committed: { "CLAUDE.md": "x" } }, []],
  [
    "an ignored file",
    { committed: { ".gitignore": "CLAUDE.md\n" }, loose: { "CLAUDE.md": "x" } },
    ["lint.ignoredFile CLAUDE.md"],
  ],
  [
    "an ignored harness folder, once with a count",
    { committed: { ".gitignore": ".claude/\n" }, loose: { ".claude/rules/a.md": "a", ".claude/rules/b.md": "b" } },
    ["lint.ignoredFolder .claude 2"],
  ],
  ["a file not committed yet", { loose: { "CLAUDE.md": "x" } }, ["lint.uncommittedFile CLAUDE.md"]],
  [
    "CLAUDE.local.md, personal by design",
    { committed: { ".gitignore": "CLAUDE.local.md\n" }, loose: { "CLAUDE.local.md": "x" } },
    [],
  ],
  ["a file nobody reads", { loose: { "notes.md": "x" } }, []],
  [
    "a link to a file that is gone",
    { links: { "CLAUDE.md": "MISSING.md" } },
    ["lint.uncommittedFile CLAUDE.md", "lint.brokenSymlink CLAUDE.md"],
  ],
  ["a link out of the repository", { links: { ".claude/skills": tmpdir() } }, ["lint.outsideLink .claude/skills"]],
])("%s", async (_, setup, expected) => {
  expect(await findings(setup)).toEqual(expected);
});
