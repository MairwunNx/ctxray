import { type Problem, problem, type Skill } from "./inventory.ts";
import { CLAUDE_STATIC_CHARS, claudeListing, codexStaticListing } from "./listing.ts";

// What a skill listing at the project root loses to the harness's budget, before anyone runs it. Claude Code
// leaves skills with their name only, Codex cuts every description short, and a description over 1,024
// characters Codex cuts on its own.
export const listingProblems = (harness: "claude-code" | "codex", skills: readonly Skill[]): Problem[] => {
  const root = skills.filter((skill) => skill.listed && skill.dir === "");
  if (root.length === 0) return [];
  const folder = harness === "codex" ? ".agents/skills" : ".claude/skills";
  if (harness === "claude-code") {
    const named = claudeListing(root, CLAUDE_STATIC_CHARS).fits.filter((fit) => fit === "name-only").length;
    if (named === 0) return [];
    const params = { harness: "Claude Code", count: named, total: root.length };
    return [problem("lint.listingNames", "warning", folder, params)];
  }
  const long = root
    .filter((skill) => [...skill.description].length > 1024)
    .map((skill) =>
      problem("lint.longDescription", "warning", skill.path, { length: [...skill.description].length, limit: 1024 }),
    );
  const fits = codexStaticListing(root).fits;
  // A description cut only for its own length has its own warning above.
  const cut = fits.filter(
    (fit, index) =>
      fit === "name-only" || (fit === "shortened" && [...(root[index] as Skill).description].length <= 1024),
  ).length;
  const omitted = fits.filter((fit) => fit === "omitted").length;
  const params = { harness: "Codex", count: cut, total: root.length };
  return [
    ...long,
    ...(omitted > 0 ? [problem("lint.listingOmitted", "warning", folder, { ...params, count: omitted })] : []),
    ...(cut > 0 && omitted === 0 ? [problem("lint.listingCut", "warning", folder, params)] : []),
  ];
};
