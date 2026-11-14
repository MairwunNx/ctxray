import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { type HarnessId, type LintConfig as Lint, LintConfig } from "#shared/contract/index.ts";
import { STATIC_ADAPTERS } from "../adapters.ts";
import { openProject } from "../project.ts";
import { checkFiles } from "./files.ts";

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

// Two broken links, one in a legacy folder, and a skill of six lines.
const FILES: Record<string, string> = {
  "CLAUDE.md": "See [the guide](docs/guide.md).\n",
  "legacy/CLAUDE.md": "See [old notes](notes.md).\n",
  ".claude/skills/big/SKILL.md": `---\nname: big\ndescription: Big.\n---\n${"Step.\n".repeat(6)}`,
};

const findings = async (
  lint: Lint,
  files = FILES,
  harness: HarnessId = "claude-code",
  links: Record<string, string> = {},
) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ctxray-lint-config-")));
  roots.push(root);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  for (const [path, target] of Object.entries(links)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    symlinkSync(target, join(root, path));
  }
  const project = await openProject(root);
  const inventory = await STATIC_ADAPTERS[harness]?.discover(project);
  if (!inventory) throw new Error(harness);
  const found = await checkFiles(project, inventory, harness, { lint: LintConfig.parse(lint), limits: undefined });
  return found.map((item) => `${item.severity} ${item.key} ${item.path}`).sort();
};

describe("lint config", () => {
  test.each<[string, Lint, string[]]>([
    ["defaults", {}, ["warning lint.brokenLink CLAUDE.md", "warning lint.brokenLink legacy/CLAUDE.md"]],
    [
      "a warning made an error",
      { rules: { "broken-link": "error" } },
      ["error lint.brokenLink CLAUDE.md", "error lint.brokenLink legacy/CLAUDE.md"],
    ],
    ["a check turned off", { rules: { "broken-link": { level: "off" } } }, []],
    ["an ignored folder", { ignore: ["legacy/**"] }, ["warning lint.brokenLink CLAUDE.md"]],
    [
      "an override for a folder",
      { rules: { "broken-link": "error" }, overrides: [{ include: ["legacy/**"], rules: { "broken-link": "off" } }] },
      ["error lint.brokenLink CLAUDE.md"],
    ],
    [
      "an override for another harness changes nothing here",
      { overrides: [{ include: ["**"], harnesses: ["codex"], rules: { "broken-link": "off" } }] },
      ["warning lint.brokenLink CLAUDE.md", "warning lint.brokenLink legacy/CLAUDE.md"],
    ],
    [
      "limits for the files an override covers",
      { overrides: [{ include: [".claude/skills/**"], limits: { skill: { lines: { error: 5 } } } }] },
      [
        "error size.lines .claude/skills/big/SKILL.md",
        "warning lint.brokenLink CLAUDE.md",
        "warning lint.brokenLink legacy/CLAUDE.md",
      ],
    ],
    [
      "every warning an error",
      { errorOnWarnings: true },
      ["error lint.brokenLink CLAUDE.md", "error lint.brokenLink legacy/CLAUDE.md"],
    ],
  ])("%s", async (_, lint, expected) => {
    expect(await findings(lint)).toEqual(expected);
  });

  test("a comment in the file silences some checks or all of them", async () => {
    const files = {
      ...FILES,
      "CLAUDE.md": "<!-- ctxray-ignore broken-link: the guide is generated -->\nSee [the guide](docs/guide.md).\n",
      "legacy/CLAUDE.md": "<!-- ctxray-ignore -->\nSee [old notes](notes.md).\n",
    };
    expect(await findings({}, files)).toEqual([]);
  });

  test("an override covers a file through any of its paths", async () => {
    const skill = FILES[".claude/skills/big/SKILL.md"] as string;
    const found = await findings(
      { overrides: [{ include: [".agents/skills/**"], limits: { skill: { lines: { error: 5 } } } }] },
      { ".agents/skills/big/SKILL.md": skill },
      "claude-code",
      { ".claude/skills": "../.agents/skills" },
    );
    expect(found).toEqual(["error size.lines .claude/skills/big/SKILL.md"]);
  });

  test("the config rejects an unknown check", () => {
    expect(LintConfig.safeParse({ rules: { "no-such-check": "off" } }).success).toBe(false);
  });
});
