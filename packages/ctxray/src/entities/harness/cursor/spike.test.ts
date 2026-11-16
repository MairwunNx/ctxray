import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { findDeadRules } from "../layers/dead-rules.ts";
import { openProject } from "../project.ts";
import { discoverCursor } from "./discover.ts";
import { resolveCursor } from "./resolve.ts";

// What Cursor CLI 2026.11.13 sent in a capture of this layout: the spike behind each case below.
const FILES = {
  "AGENTS.md": "root agents",
  "copy/AGENTS.md": "same text",
  "copy/CLAUDE.md": "same text",
  "copy/x.txt": "x",
  ".cursor/rules/compose.mdc": "---\nglobs: docker-compose*.yml\n---\n\ncompose rule\n",
  "docker-compose.yml": "services: {}",
  "sub/docker-compose.dev.yml": "services: {}",
  "sub/.cursor/rules/req1.mdc": "---\ndescription: Read before touching billing\n---\n\nreq one\n",
  "sub/deep/.cursor/rules/req2.mdc": "---\ndescription: Read before touching ledgers\n---\n\nreq two\n",
  ".cursor/rules/deeper.mdc": "---\nglobs: *.dev.yml\n---\n\nonly a deeper file matches\n",
};

const root = mkdtempSync(join(tmpdir(), "ctxray-cursor-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
for (const [path, text] of Object.entries(FILES)) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}
symlinkSync("AGENTS.md", join(root, "CLAUDE.md"));

const rules = async (files: string[]) => {
  const inventory = await discoverCursor(await openProject(root), "cursor-cli");
  return resolveCursor("cursor-cli")(inventory, { cwd: "", files }).rules.map((rule) => rule.path);
};

test.each<[string, string[], string[]]>([
  [
    "a CLAUDE.md linked to the AGENTS.md loads once, described rules from every folder at the start",
    [],
    ["AGENTS.md", "sub/.cursor/rules/req1.mdc", "sub/deep/.cursor/rules/req2.mdc"],
  ],
  ["a glob without a slash takes the file beside the rules", ["docker-compose.yml"], [".cursor/rules/compose.mdc"]],
  ["and not one a folder deeper", ["sub/docker-compose.dev.yml"], []],
  ["two files with the same text both load", ["copy/x.txt"], ["copy/AGENTS.md", "copy/CLAUDE.md"]],
])("%s", async (_, files, added) => {
  const start = ["AGENTS.md", "sub/.cursor/rules/req1.mdc", "sub/deep/.cursor/rules/req2.mdc"];
  expect((await rules(files)).sort()).toEqual([...new Set([...start, ...added])].sort());
});

test("a Cursor glob only a deeper file matches is a dead rule", async () => {
  const project = await openProject(root);
  const dead = findDeadRules(project, await discoverCursor(project, "cursor-cli")).map((found) => found.path);
  expect(dead).toEqual([".cursor/rules/deeper.mdc"]);
});
