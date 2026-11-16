import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { HarnessId } from "#shared/contract/index.ts";
import { STATIC_ADAPTERS } from "./adapters.ts";
import { openProject } from "./project.ts";

// What spike 0017 saw each harness load from a file that is right but unusual: nested skills, an empty or
// missing description, a byte order mark, tabs in the frontmatter, an upper-case extension.
const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

const discovered = async (harness: HarnessId, files: Record<string, string>) => {
  const root = mkdtempSync(join(tmpdir(), "ctxray-discovery-"));
  roots.push(root);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  const inventory = await STATIC_ADAPTERS[harness]?.discover(await openProject(root));
  if (!inventory) throw new Error(harness);
  return {
    skills: inventory.skills.filter((skill) => skill.listed).map((skill) => skill.path),
    rules: inventory.instructions.map((rule) => `${rule.path} ${rule.globs?.join(",") ?? "always"}`),
  };
};

const skill = (frontmatter: string) => `---\nname: refunds\n${frontmatter}---\nBody.\n`;
const described = skill("description: Refunds.\n");
const nested = { ".agents/skills/payments/refunds/SKILL.md": described };

test.each<[HarnessId, Record<string, string>, string[]]>([
  ["codex", nested, [".agents/skills/payments/refunds/SKILL.md"]],
  ["opencode", nested, [".agents/skills/payments/refunds/SKILL.md"]],
  ["cursor-cli", nested, [".agents/skills/payments/refunds/SKILL.md"]],
  ["gemini-cli", nested, []],
  ["codex", { ".codex/skills/payments/refunds/SKILL.md": described }, [".codex/skills/payments/refunds/SKILL.md"]],
  [
    "opencode",
    { ".opencode/skill/payments/refunds/SKILL.md": described },
    [".opencode/skill/payments/refunds/SKILL.md"],
  ],
  ["claude-code", { ".claude/skills/payments/refunds/SKILL.md": described }, []],
  // No description: Claude Code lists the body instead, the others skip it, Gemini CLI wants only the key.
  ["claude-code", { ".claude/skills/refunds/SKILL.md": skill("") }, [".claude/skills/refunds/SKILL.md"]],
  ["cursor-cli", { ".claude/skills/refunds/SKILL.md": skill("") }, []],
  ["opencode", { ".claude/skills/refunds/SKILL.md": skill("") }, []],
  ["opencode", { ".claude/skills/refunds/SKILL.md": skill("description:\n") }, []],
  ["opencode", { ".claude/skills/refunds/SKILL.md": skill('description: ""\n') }, [".claude/skills/refunds/SKILL.md"]],
  ["gemini-cli", { ".agents/skills/refunds/SKILL.md": skill("description:\n") }, [".agents/skills/refunds/SKILL.md"]],
  ["gemini-cli", { ".agents/skills/refunds/SKILL.md": skill("") }, []],
  // A byte order mark: only Codex refuses the skill.
  ["codex", { ".agents/skills/refunds/SKILL.md": `﻿${described}` }, []],
  ["gemini-cli", { ".agents/skills/refunds/SKILL.md": `﻿${described}` }, [".agents/skills/refunds/SKILL.md"]],
  // Tabs in the frontmatter: Claude Code and Codex skip the skill, the others read past them.
  ["claude-code", { ".claude/skills/refunds/SKILL.md": skill("\tdescription: Refunds.\n") }, []],
  ["codex", { ".agents/skills/refunds/SKILL.md": skill("\tdescription: Refunds.\n") }, []],
  [
    "gemini-cli",
    { ".agents/skills/refunds/SKILL.md": skill("\tdescription: Refunds.\n") },
    [".agents/skills/refunds/SKILL.md"],
  ],
])("%s lists the skills of %j", async (harness, files, expected) => {
  expect((await discovered(harness, files)).skills).toEqual(expected);
});

test.each<[HarnessId, Record<string, string>, string[]]>([
  ["cursor-cli", { ".cursor/rules/web.MDC": "---\nalwaysApply: true\n---\nWeb.\n" }, [".cursor/rules/web.MDC always"]],
  ["cursor-cli", { ".cursor/rules/web.md": "---\nalwaysApply: true\n---\nWeb.\n" }, []],
  // Claude Code takes a tab in a rule for indentation, and drops the frontmatter when that still fails.
  ["claude-code", { ".claude/rules/web.md": "---\npaths:\n\t- web/**\n---\nWeb.\n" }, [".claude/rules/web.md web/**"]],
  [
    "claude-code",
    { ".claude/rules/web.md": "---\ndescription: Web\n\tpaths: web/**\n---\nWeb.\n" },
    [".claude/rules/web.md always"],
  ],
  // A name in another case is another file: CI runs on Linux.
  ["claude-code", { "claude.md": "Notes.\n" }, []],
])("%s reads the rules of %j", async (harness, files, expected) => {
  expect((await discovered(harness, files)).rules).toEqual(expected);
});
