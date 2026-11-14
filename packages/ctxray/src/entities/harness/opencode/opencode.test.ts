import { describe, expect, test } from "bun:test";
import { findingsOf, resolveIn } from "../static.fixture.ts";

describe("OpenCode on its fixture", () => {
  test("L1 findings", async () => {
    expect(await findingsOf("opencode", "opencode")).toEqual([
      "error lint.mcpTransport opencode.jsonc",
      "error lint.skillField .agents/skills/noname/SKILL.md",
    ]);
  });

  test("a CLAUDE.md beside an AGENTS.md never loads", async () => {
    const { inventory } = await resolveIn("opencode", "opencode");
    expect(inventory.ignored).toEqual(["CLAUDE.md"]);
  });

  test.each<[string, string, string[], string[]]>([
    [
      "the root session: AGENTS.md and the config's instructions",
      "",
      [],
      ["AGENTS.md always cwd", "docs/style.md always config"],
    ],
    [
      // AGENTS.md wins the name for the whole way up, so app/CLAUDE.md waits for a read from above.
      "a session in app reads the root's AGENTS.md, and a read below brings app/sub's",
      "app",
      ["app/sub/x.ts"],
      ["AGENTS.md always cwd", "docs/style.md always config", "app/sub/AGENTS.md path nested:app/sub/x.ts"],
    ],
    [
      "a read from the root brings each folder's first file on the way",
      "",
      ["app/sub/x.ts"],
      [
        "AGENTS.md always cwd",
        "docs/style.md always config",
        "app/sub/AGENTS.md path nested:app/sub/x.ts",
        "app/CLAUDE.md path nested:app/sub/x.ts",
      ],
    ],
  ])("%s", async (_, cwd, files, expected) => {
    const { loadout } = await resolveIn("opencode", "opencode", { cwd, files });
    expect(loadout.rules.map((rule) => `${rule.path} ${rule.activation} ${rule.reason}`)).toEqual(expected);
  });

  test("skills, MCP servers, and commands of every folder from the cwd up", async () => {
    const root = (await resolveIn("opencode", "opencode")).loadout;
    expect(root.skills.listed.map((skill) => skill.name).sort()).toEqual(["deploy", "review"]);
    expect(root.mcp.servers.map((server) => server.name)).toEqual(["probe", "docs", "broken"]);
    expect(root.commands.map((command) => command.name)).toEqual(["changelog", "hello"]);
    expect(root.tokens.byComponent.commands).toBe(0);
    const app = (await resolveIn("opencode", "opencode", { cwd: "app" })).loadout;
    expect(app.skills.listed.map((skill) => skill.name).sort()).toEqual(["build", "deploy", "review"]);
  });
});
