import { afterAll, expect, test } from "bun:test";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";
import { UnknownRevision } from "#entities/harness/index.ts";
import { DEFAULT_CONFIG } from "#entities/user-config/index.ts";
import { createDiffAction } from "./diff.action.ts";

const dirs: string[] = [];
afterAll(async () => {
  for (const dir of dirs) await rm(dir, { recursive: true, force: true });
});

test("names what came, went, and changed since the base, and leaves the working tree alone", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "ctxray-diff-")));
  dirs.push(root);
  await Bun.write(join(root, "CLAUDE.md"), "Use Kotlin.\n");
  await Bun.write(join(root, ".claude/rules/old.md"), "Old rule.\n");
  await $`git -C ${root} init -q && git -C ${root} add -A && git -C ${root} -c user.name=t -c user.email=t@t commit -qm base`.quiet();
  await Bun.write(join(root, "CLAUDE.md"), "Use Kotlin. Write tests for every change, and keep them fast.\n");
  await rm(join(root, ".claude/rules/old.md"));
  await Bun.write(join(root, ".claude/rules/new.md"), "New rule.\n");
  const before = await $`git -C ${root} status --porcelain`.text();
  const result = await createDiffAction(DEFAULT_CONFIG, root)({ base: "HEAD", harnesses: ["claude-code"] });
  const changes = result.diffs[0]?.diff.changes.map((change) => [
    change.id,
    change.before === undefined ? "added" : change.after === undefined ? "removed" : "changed",
  ]);
  expect(changes).toEqual([
    ["CLAUDE.md", "changed"],
    [".claude/rules/old.md", "removed"],
    [".claude/rules/new.md", "added"],
  ]);
  expect(await $`git -C ${root} status --porcelain`.text()).toBe(before);
  expect(createDiffAction(DEFAULT_CONFIG, root)({ base: "nope" })).rejects.toBeInstanceOf(UnknownRevision);
});
