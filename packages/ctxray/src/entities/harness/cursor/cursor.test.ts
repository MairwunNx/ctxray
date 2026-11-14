import { describe, expect, test } from "bun:test";
import { findingsOf, resolveIn } from "../static.fixture.ts";

const lines = async (cwd: string, files: string[] = []) =>
  (await resolveIn("cursor", "cursor-cli", { cwd, files })).loadout.rules.map(
    (rule) => `${rule.path} ${rule.activation} ${rule.reason}`,
  );

const ROOT = [
  "AGENTS.md always cwd",
  "CLAUDE.md always cwd",
  ".cursor/rules/always.mdc always cwd",
  ".cursorrules always cwd",
];

describe("Cursor on its fixture", () => {
  test("L1 findings", async () => {
    expect(await findingsOf("cursor", "cursor-cli")).toEqual(["error lint.mcpTransport .cursor/mcp.json"]);
  });

  test("the four kinds of rule by their frontmatter, `alwaysApply: yes` not counting as true", async () => {
    const { inventory } = await resolveIn("cursor", "cursor-cli");
    const kinds = inventory.instructions
      .filter((file) => file.path.endsWith(".mdc"))
      .map((file) => `${file.path} ${file.activation}`);
    expect(kinds.sort()).toEqual([
      ".cursor/rules/always.mdc always",
      ".cursor/rules/manual.mdc manual",
      ".cursor/rules/requested.mdc intent",
      ".cursor/rules/ts.mdc path",
      ".cursor/rules/yes.mdc manual",
      "src/.cursor/rules/nested.mdc always",
    ]);
  });

  test.each<[string, string, string[], string[]]>([
    [
      "the root session: always rules, then the ones the model fetches by description",
      "",
      [],
      [...ROOT, ".cursor/rules/requested.mdc intent description"],
    ],
    [
      "a read under src brings its AGENTS.md, its nested rule, and the glob rule",
      "",
      ["src/index.ts"],
      [
        ...ROOT,
        ".cursor/rules/requested.mdc intent description",
        "src/AGENTS.md path nested:src/index.ts",
        "src/.cursor/rules/nested.mdc path nested:src/index.ts",
        ".cursor/rules/ts.mdc path glob:src/**/*.ts",
      ],
    ],
    [
      "a session in src has them from the start",
      "src",
      [],
      [
        ...ROOT,
        "src/AGENTS.md always cwd",
        "src/.cursor/rules/nested.mdc always cwd",
        ".cursor/rules/requested.mdc intent description",
      ],
    ],
  ])("%s", async (_, cwd, files, expected) => {
    expect(await lines(cwd, files)).toEqual(expected);
  });

  test("skills of the cwd at launch, a folder's below once a file there is read", async () => {
    const skills = async (cwd: string, files: string[] = []) =>
      (await resolveIn("cursor", "cursor-cli", { cwd, files })).loadout.skills.listed.map((skill) => skill.name).sort();
    // `disable-model-invocation: yes` is a string to Cursor too: the skill stays listed.
    expect(await skills("")).toEqual(["deploy", "review"]);
    expect(await skills("", ["src/index.ts"])).toEqual(["build", "deploy", "review"]);
    expect(await skills("src")).toEqual(["build"]);
  });

  test("the editor reads the same files", async () => {
    const cli = (await resolveIn("cursor", "cursor-cli", { files: ["src/index.ts"] })).loadout;
    const ide = (await resolveIn("cursor", "cursor-ide", { files: ["src/index.ts"] })).loadout;
    expect({ ...ide, harness: "cursor-cli" }).toEqual(cli);
  });
});
