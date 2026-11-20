import { expect, test } from "bun:test";
import { join } from "node:path";
import { claudeListing, claudeListingChars, codexListing, type ListedSkill, type Listing } from "./listing.ts";

// Skill listings the harnesses really sent, captured with 61 and 201 project skills: the rules have to rebuild
// them line by line. Claude Code's own skills carry filler of their descriptions' length.
type Fixture = { budget?: number; window?: number; charsPerToken?: number; skills: ListedSkill[]; lines: string[] };
const FIXTURES = join(import.meta.dir, "../../../fixtures/listings");
const load = async (name: string) => (await Bun.file(join(FIXTURES, name)).json()) as Fixture;

test.each<[string, (skills: ListedSkill[], budget: number) => Listing]>([
  ["codex-0.171.0.json", codexListing],
  ["claude-code-2.1.328-claude-sonnet-5-5.json", claudeListing],
  ["claude-code-2.1.328-claude-haiku-4-5.json", claudeListing],
])("%s", async (name, listing) => {
  const { budget, window, charsPerToken, skills, lines } = await load(name);
  const room = budget ?? claudeListingChars(window ?? 0, charsPerToken ?? 0);
  expect(listing(skills, room).lines.filter((line) => line !== "")).toEqual(lines);
});

test("Claude Code keeps every description that fits, and names the rest", () => {
  const skills = [
    { name: "a", description: "x".repeat(30) },
    { name: "b", description: "y".repeat(30) },
  ];
  expect(claudeListing(skills, 1000).fits).toEqual(["full", "full"]);
  expect(claudeListing(skills, 40).fits).toEqual(["full", "name-only"]);
  expect(claudeListing([{ name: "c", description: "z".repeat(2000) }], 5000).fits).toEqual(["shortened"]);
});

test("Codex shares the room between descriptions, and drops skills once even the names don't fit", () => {
  const skills = [
    { name: "a", description: "x".repeat(200) },
    { name: "b", description: "y".repeat(200) },
  ];
  expect(codexListing(skills, 1000).fits).toEqual(["full", "full"]);
  expect(codexListing(skills, 60).fits).toEqual(["shortened", "shortened"]);
  expect(codexListing(skills, 10).fits).toEqual(["name-only", "omitted"]);
});
