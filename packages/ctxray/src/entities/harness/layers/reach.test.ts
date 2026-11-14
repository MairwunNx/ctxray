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

const reach = async (root: string, harnesses: HarnessId[] = ["claude-code", "codex"]) => {
  const opened = await openProject(root);
  const inventories = Object.fromEntries(
    await Promise.all(harnesses.map(async (id) => [id, await STATIC_ADAPTERS[id]?.discover(opened)])),
  );
  const found = await checkReach(opened, inventories);
  return harnesses.flatMap((id) => (found[id] ?? []).map((item) => `${id} ${item.key} ${item.path}`)).sort();
};

test("names what a harness never reads, and what none does", async () => {
  const root = project({
    "CLAUDE.md": "Use bun.\n",
    ".agents/skills/deploy/SKILL.md": skill("deploy"),
    ".agents/streams/team/skills/triage/SKILL.md": skill("triage"),
    ".agents/rules/style.md": "Short functions.\n",
    ".agents/README.md": "For people.\n",
  });
  expect(await reach(root)).toEqual([
    "claude-code reach.skillsMissed .agents/skills",
    "claude-code reach.skillsNowhere .agents/streams/team/skills",
    "claude-code reach.unread .agents/rules/style.md",
    "codex reach.claudeOnly CLAUDE.md",
    "codex reach.skillsNowhere .agents/streams/team/skills",
    "codex reach.unread .agents/rules/style.md",
  ]);
});

test("a symlink and a link from read files make it reach", async () => {
  const root = project(
    {
      "AGENTS.md": "See [style](.agents/rules/style.md).\n",
      "CLAUDE.md": "@AGENTS.md\n",
      ".agents/skills/deploy/SKILL.md": skill("deploy"),
      ".agents/rules/style.md": "Short functions.\n",
    },
    { ".claude/skills": "../.agents/skills" },
  );
  expect(await reach(root)).toEqual([]);
});

test("a harness's own folder counts only when the harness takes part", async () => {
  const root = project({ "AGENTS.md": "Hi.\n", ".opencode/agents/review.md": "Review.\n" });
  expect(await reach(root, ["codex"])).toEqual([]);
});
