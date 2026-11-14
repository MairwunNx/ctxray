import { afterAll, expect, test } from "bun:test";
import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { openProject } from "../project.ts";
import { createCopy } from "./isolate.ts";

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test("symlinks stay symlinks, and the real file gets one canary for all its paths", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ctxray-isolate-")));
  const outside = realpathSync(mkdtempSync(join(tmpdir(), "ctxray-outside-")));
  roots.push(root, outside);
  writeFileSync(join(root, "CLAUDE.md"), "Use bun.\n");
  symlinkSync("CLAUDE.md", join(root, "AGENTS.md"));
  writeFileSync(join(outside, "shared.md"), "Shared rules.\n");
  symlinkSync(join(outside, "shared.md"), join(root, "GEMINI.md"));
  const project = await openProject(root);
  const copy = await createCopy(project, new Set(["CLAUDE.md", "AGENTS.md", "GEMINI.md"]));
  roots.push(dirname(copy.work));

  expect(lstatSync(join(copy.work, "AGENTS.md")).isSymbolicLink()).toBe(true);
  expect(readlinkSync(join(copy.work, "AGENTS.md"))).toBe("CLAUDE.md");
  expect(readFileSync(join(copy.work, "CLAUDE.md"), "utf8")).toBe("Use bun.\n\n⟦ctx:CLAUDE.md⟧\n");
  expect(copy.aliases).toEqual({ "CLAUDE.md": ["AGENTS.md"] });
  // A link out of the project leads to a file ctxray must never write.
  expect(readFileSync(join(outside, "shared.md"), "utf8")).toBe("Shared rules.\n");
  expect(readFileSync(join(root, "CLAUDE.md"), "utf8")).toBe("Use bun.\n");
});
