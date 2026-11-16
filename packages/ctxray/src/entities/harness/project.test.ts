import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { $ } from "bun";
import { openProject } from "./project.ts";

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

const FILES = {
  "CLAUDE.md": "",
  ".ctxray/report/index.html": "",
  ".ctxray-cache/harnesses/claude-code/2.1.0/CLAUDE.md": "",
  "docs/.ctxray-cache/CLAUDE.md": "",
};

// CI keeps the harness cache inside the project, as the GitLab template does: no harness reads it.
test.each([false, true])("ctxray's own folders aren't project files (git: %p)", async (git) => {
  const root = mkdtempSync(join(tmpdir(), "ctxray-project-"));
  roots.push(root);
  for (const [path, text] of Object.entries(FILES)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  if (git) await $`git init -q`.cwd(root).quiet();
  expect([...(await openProject(root)).files].sort()).toEqual(["CLAUDE.md", "docs/.ctxray-cache/CLAUDE.md"]);
});
