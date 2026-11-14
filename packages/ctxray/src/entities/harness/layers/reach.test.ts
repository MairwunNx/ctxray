import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { HarnessId } from "#shared/contract/index.ts";
import { STATIC_ADAPTERS } from "../adapters.ts";
import { openProject } from "../project.ts";
import { checkReach } from "./reach.ts";

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

const skill = (name: string) => `---\nname: ${name}\ndescription: Does ${name}.\n---\nBody\n`;

const project = (files: Record<string, string>, links: Record<string, string> = {}) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ctxray-reach-")));
  roots.push(root);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  for (const [path, target] of Object.entries(links)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    symlinkSync(target, join(root, path));
  }
  return root;
};

const reach = async (root: string, harnesses: HarnessId[] = ["claude-code", "codex"], differences = true) => {
  const opened = await openProject(root);
  const inventories = Object.fromEntries(
    await Promise.all(harnesses.map(async (id) => [id, await STATIC_ADAPTERS[id]?.discover(opened)])),
  );
  const found = await checkReach(opened, inventories, { differences });
  return harnesses
    .flatMap((id) => (found[id] ?? []).map((item) => `${id} ${item.severity} ${item.key} ${item.path}`))
    .sort();
};

test("what no harness reads is an error, what others read or harnesses get differently a warning", async () => {
  const root = project({
    "CLAUDE.md": "Use bun.\n",
    ".agents/skills/deploy/SKILL.md": skill("deploy"),
    ".agents/streams/team/skills/triage/SKILL.md": skill("triage"),
    ".agents/rules/style.md": "Short functions.\n",
    ".agents/README.md": "For people.\n",
    ".cursor/rules/web.mdc": "React.\n",
  });
  expect(await reach(root)).toEqual([
    "claude-code error reach.nowhere .agents/rules/style.md",
    "claude-code error reach.nowhereSkills .agents/streams/team/skills",
    "claude-code warning reach.differsSkills .agents/skills",
    "claude-code warning reach.otherHarnesses .cursor/rules/web.mdc",
    "codex error reach.nowhere .agents/rules/style.md",
    "codex error reach.nowhereSkills .agents/streams/team/skills",
    "codex warning reach.differs CLAUDE.md",
    "codex warning reach.otherHarnesses .cursor/rules/web.mdc",
  ]);
  expect((await reach(root, ["claude-code", "codex"], false)).filter((line) => line.includes("differs"))).toEqual([]);
});

test("the same text under another name, a symlink, an import, or a link reaches everyone", async () => {
  const root = project(
    {
      "AGENTS.md": "See [style](.agents/rules/style.md). Use bun.\n",
      "CLAUDE.md": "@AGENTS.md\n",
      "lib/CLAUDE.md": "Lib rules.\n",
      "lib/AGENTS.md": "Lib   rules.\n",
      ".agents/skills/deploy/SKILL.md": skill("deploy"),
      ".claude/skills/review/SKILL.md": skill("review"),
      ".agents/skills/review/SKILL.md": skill("review"),
      ".agents/rules/style.md": "Short functions.\n",
    },
    { ".claude/skills/deploy": "../../.agents/skills/deploy" },
  );
  expect(await reach(root)).toEqual([]);
});

test("a copy that says something else is a difference", async () => {
  const root = project({ "CLAUDE.md": "Use bun.\n", "AGENTS.md": "Use npm.\n" });
  expect(await reach(root)).toEqual([
    "claude-code warning reach.differs AGENTS.md",
    "codex warning reach.differs CLAUDE.md",
  ]);
});

test("a harness's own folder outside the run reads as that harness's", async () => {
  const root = project({ "AGENTS.md": "Hi.\n", ".opencode/agents/review.md": "Review.\n" });
  expect(await reach(root, ["codex"])).toEqual(["codex warning reach.otherHarness .opencode/agents/review.md"]);
});
