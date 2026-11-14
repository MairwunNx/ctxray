import { describe, expect, test } from "bun:test";
import type { HarnessId } from "#shared/contract/index.ts";
import { findingsOf, resolveIn } from "./static.fixture.ts";

const CHARGE = "app/src/main/kotlin/payments/Charge.kt";

describe("L1 lint and dead rules on fixtures", () => {
  test.each<[string, HarnessId, string[]]>([
    ["payments", "claude-code", ["warning resolve.deadRule .claude/rules/web.md"]],
    ["payments", "codex", []],
    [
      "broken",
      "claude-code",
      [
        "error lint.globUnbalanced .claude/rules/bad-yaml.md",
        "error lint.globUnbalanced .claude/rules/braces.md",
        "error lint.mcpTransport .mcp.json",
        "warning lint.brokenLink CLAUDE.md:5",
        "warning lint.duplicateText .claude/rules/dup-b.md",
        "warning lint.importDepth docs/four.md:1",
        "warning lint.importMissing CLAUDE.md:2",
        "warning lint.longDescription .claude/skills/Bad_Name/SKILL.md",
        "warning lint.looseFrontmatter .claude/rules/bad-yaml.md",
        "warning lint.noDescription .claude/skills/nodesc/SKILL.md",
        "warning lint.ruleField .claude/rules/cursor.md",
        "warning lint.ruleField .claude/rules/cursor.md",
        "warning lint.shadowedCommand .claude/commands/deploy.md",
        "warning lint.skillName .claude/skills/Bad_Name/SKILL.md",
      ],
    ],
    [
      "broken",
      "codex",
      [
        "error lint.mcpTransport .codex/config.toml",
        "error lint.skillField .agents/skills/half/SKILL.md",
        "warning lint.budget sub/AGENTS.override.md",
        "warning lint.duplicateSkill .codex/skills/dup/SKILL.md",
        "warning lint.empty empty/AGENTS.md",
        "warning lint.shadowed sub/AGENTS.md",
      ],
    ],
  ])("%s for %s", async (fixture, harness, expected) => {
    expect(await findingsOf(fixture, harness)).toEqual(expected);
  });
});

type Expected = { cwd: string; files?: string[]; rules: string[]; skills: string[] };

describe("L3 resolve on the payments fixture", () => {
  test.each<[string, HarnessId, Expected]>([
    [
      "the root session loads root files only",
      "claude-code",
      {
        cwd: "",
        rules: ["CLAUDE.md always cwd", "AGENTS.md always import:CLAUDE.md", ".claude/rules/style.md always always"],
        skills: ["payouts", "refunds"],
      },
    ],
    [
      "payments rules attach to payment sources",
      "claude-code",
      {
        cwd: "app",
        files: [CHARGE],
        rules: [
          "CLAUDE.md always cwd",
          "AGENTS.md always import:CLAUDE.md",
          ".claude/rules/style.md always always",
          "app/CLAUDE.md always cwd",
          "app/AGENTS.md always import:app/CLAUDE.md",
          "app/src/main/kotlin/payments/CLAUDE.md path nested:app/src/main/kotlin/payments/Charge.kt",
          "app/src/main/kotlin/payments/AGENTS.md path import:app/src/main/kotlin/payments/CLAUDE.md",
          ".claude/rules/kotlin.md path glob:**/*.kt",
          ".claude/rules/payments.md path glob:**/payments/**/*.kt",
        ],
        skills: ["payouts", "refunds", "android-build"],
      },
    ],
    [
      "a nested CLAUDE.md loads when the agent touches a file below it",
      "claude-code",
      {
        cwd: "",
        files: ["app/src/main/kotlin/web/Page.kt"],
        rules: [
          "CLAUDE.md always cwd",
          "AGENTS.md always import:CLAUDE.md",
          ".claude/rules/style.md always always",
          "app/CLAUDE.md path nested:app/src/main/kotlin/web/Page.kt",
          "app/AGENTS.md path import:app/CLAUDE.md",
          ".claude/rules/kotlin.md path glob:**/*.kt",
        ],
        skills: ["payouts", "refunds", "android-build"],
      },
    ],
    [
      "codex reads AGENTS.md at the root only",
      "codex",
      { cwd: "", rules: ["AGENTS.md always cwd"], skills: ["payouts", "refunds", "release"] },
    ],
    [
      "codex fixes the chain by the cwd, whatever the agent reads",
      "codex",
      {
        cwd: "app/src/main/kotlin/payments",
        files: ["app/src/main/kotlin/web/Page.kt"],
        rules: [
          "AGENTS.md always cwd",
          "app/AGENTS.md always cwd",
          "app/src/main/kotlin/payments/AGENTS.md always cwd",
        ],
        skills: ["android-build", "payouts", "refunds", "release"],
      },
    ],
  ])("%s (%s)", async (_, harness, { cwd, files = [], rules, skills }) => {
    const { loadout } = await resolveIn("payments", harness, { cwd, files });
    expect(loadout.rules.map((rule) => `${rule.path} ${rule.activation} ${rule.reason}`)).toEqual(rules);
    expect(loadout.skills.listed.map((skill) => skill.name)).toEqual(skills);
  });

  test.each<[HarnessId, string[], string[]]>([
    ["claude-code", ["github", "jira"], ["changelog"]],
    ["codex", ["github", "jira"], []],
  ])("%s lists the enabled MCP servers and the commands", async (harness, servers, commands) => {
    const { loadout } = await resolveIn("payments", harness);
    expect(loadout.mcp.servers.map((server) => server.name)).toEqual(servers);
    expect(loadout.commands.map((command) => command.name)).toEqual(commands);
  });

  test("tokens are local estimates and never claim to be exact", async () => {
    const { loadout } = await resolveIn("payments", "claude-code");
    expect(loadout.tokens).toMatchObject({ exact: false, method: "local:o200k_base", calibration: "none" });
    const rules = loadout.rules.reduce((sum, rule) => sum + rule.tokens, 0);
    expect(loadout.tokens.byComponent.rules).toBe(rules);
    expect(rules).toBeGreaterThan(0);
  });

  test("codex cuts the AGENTS.md chain at its byte budget", async () => {
    const { loadout } = await resolveIn("broken", "codex", { cwd: "sub" });
    expect(loadout.rules.map((rule) => rule.path)).toEqual(["AGENTS.md", "sub/AGENTS.override.md"]);
    expect(loadout.rules[1]?.tokens).toBeLessThan(10);
  });
});
