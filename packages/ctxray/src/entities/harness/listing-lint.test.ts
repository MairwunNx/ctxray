import { expect, test } from "bun:test";
import type { Skill } from "./inventory.ts";
import { listingProblems } from "./listing-lint.ts";

const skill = (name: string, description: string, dir = ""): Skill => ({
  name,
  path: `.claude/skills/${name}/SKILL.md`,
  dir,
  description,
  listed: true,
  body: "",
});
const many = (count: number) => Array.from({ length: count }, (_, i) => skill(`area-${i}`, "x".repeat(330)));

test.each<[string, "claude-code" | "codex", Skill[], string[]]>([
  ["a few skills fit Claude Code", "claude-code", many(10), []],
  ["200 skills leave Claude Code names only", "claude-code", many(200), ["lint.listingNames"]],
  ["skills in a subfolder count where they load", "claude-code", many(200).map((one) => ({ ...one, dir: "app" })), []],
  ["a few skills fit Codex", "codex", many(5), []],
  ["60 skills make Codex cut descriptions", "codex", many(60), ["lint.listingCut"]],
  ["a long description Codex cuts on its own", "codex", [skill("huge", "x".repeat(1100))], ["lint.longDescription"]],
])("%s", (_, harness, skills, keys) => {
  expect(listingProblems(harness, skills).map((found) => String(found.key))).toEqual(keys);
});
