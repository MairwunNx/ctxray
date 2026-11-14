import { describe, expect, test } from "bun:test";
import { findingsOf, resolveIn } from "../static.fixture.ts";

describe("Gemini CLI on its fixture", () => {
  test("L1 findings", async () => {
    expect(await findingsOf("gemini", "gemini-cli")).toEqual([
      "error lint.mcpTransport .gemini/settings.json",
      "error lint.skillField .gemini/skills/half/SKILL.md",
      "warning lint.empty empty/GEMINI.md",
    ]);
  });

  test.each<[string, string, string[], string[]]>([
    [
      "the root session takes GEMINI.md and AGENTS.md, imports inlined",
      "",
      [],
      ["AGENTS.md always cwd", "GEMINI.md always cwd", "docs/style.md always import:GEMINI.md"],
    ],
    [
      "a read below the cwd brings in the context files on the way",
      "",
      ["sub/dir/code.ts"],
      [
        "AGENTS.md always cwd",
        "GEMINI.md always cwd",
        "docs/style.md always import:GEMINI.md",
        "sub/dir/AGENTS.md path nested:sub/dir/code.ts",
        "sub/dir/GEMINI.md path nested:sub/dir/code.ts",
      ],
    ],
    [
      // The settings live in the root's .gemini, so AGENTS.md is no context file for a session started here.
      "a session in sub/dir reads GEMINI.md only",
      "sub/dir",
      ["sub/other/other.ts"],
      ["GEMINI.md always cwd", "docs/style.md always import:GEMINI.md", "sub/dir/GEMINI.md always cwd"],
    ],
  ])("%s", async (_, cwd, files, expected) => {
    const { loadout } = await resolveIn("gemini", "gemini-cli", { cwd, files });
    expect(loadout.rules.map((rule) => `${rule.path} ${rule.activation} ${rule.reason}`)).toEqual(expected);
  });

  test("skills, MCP servers, and commands come from the cwd's own folders", async () => {
    const root = (await resolveIn("gemini", "gemini-cli")).loadout;
    expect(root.skills.listed.map((skill) => skill.name)).toEqual(["review", "deploy"]);
    expect(root.mcp.servers.map((server) => server.name)).toEqual(["probe", "docs", "broken"]);
    expect(root.commands).toEqual([{ name: "git:commit", path: ".gemini/commands/git/commit.toml" }]);
    expect(root.tokens.byComponent.commands).toBe(0);
    const nested = (await resolveIn("gemini", "gemini-cli", { cwd: "sub/dir" })).loadout;
    expect([nested.skills.listed, nested.mcp.servers, nested.commands]).toEqual([[], [], []]);
  });
});
