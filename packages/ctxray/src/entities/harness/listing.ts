import type { SkillEntry } from "#shared/contract/index.ts";

// How a harness fits its skill listing into a budget, and what each skill keeps of its description. Both rules
// were read from the harnesses themselves and checked against captured requests (stage 19).
export type Fit = "full" | "shortened" | "name-only" | "omitted";
// `bundled`: shipped with the harness, `nameOnly`: listed by name whatever the budget.
export type ListedSkill = {
  name: string;
  description: string;
  locator?: string;
  bundled?: boolean;
  nameOnly?: boolean;
};
// `lines` match `fits` one to one, an omitted skill's line is empty.
export type Listing = { lines: string[]; fits: Fit[]; budget: number; used: number };

// Claude Code 2.1.328: `windowTokens × charsPerToken × 1%` characters. Models before the 4.7 tokenizer count four
// characters a token, later ones three, so the default claude-sonnet-5-5 with its 1M window gets 30,000. About
// 700 of them never show in the listing: captures with a 1M and a 200k window both left 690 to 724 unused.
export const claudeListingChars = (windowTokens: number, charsPerToken: number) =>
  Math.floor(windowTokens * charsPerToken * 0.01) - CLAUDE_HIDDEN;
const CLAUDE_HIDDEN = 700;
export const CLAUDE_LISTING_CHARS = claudeListingChars(1_000_000, 3);
const CLAUDE_DESCRIPTION = 1536;

const claudeDescription = (description: string) =>
  description.length > CLAUDE_DESCRIPTION ? `${description.slice(0, CLAUDE_DESCRIPTION - 1)}…` : description;

// Every skill with its description if the listing fits. Otherwise each skill keeps its name, and descriptions
// go back in order while they fit: the most used first in a live session, the listing order for a new one.
// The skills Claude Code ships keep theirs whatever the budget.
export const claudeListing = (skills: readonly ListedSkill[], budget = CLAUDE_LISTING_CHARS): Listing => {
  const named = skills.map((skill) => `- ${skill.name}`);
  const full = skills.map((skill, index) =>
    skill.nameOnly ? (named[index] as string) : `${named[index]}: ${claudeDescription(skill.description)}`,
  );
  const cut = (index: number, fit: Fit): Fit =>
    fit === "full" && (skills[index] as ListedSkill).description.length > CLAUDE_DESCRIPTION ? "shortened" : fit;
  const total = full.reduce((sum, line) => sum + line.length, 0) + Math.max(0, skills.length - 1);
  if (total <= budget) return { lines: full, fits: skills.map((_, index) => cut(index, "full")), budget, used: total };
  const base = skills.reduce(
    (sum, skill, index) => sum + ((skill.bundled || skill.nameOnly ? full[index] : named[index]) as string).length,
    Math.max(0, skills.length - 1),
  );
  let left = budget - base;
  const fits = skills.map((skill, index): Fit => {
    if (skill.nameOnly) return "name-only";
    if (skill.bundled) return cut(index, "full");
    const extra = (full[index] as string).length - (named[index] as string).length;
    if (extra > left) return "name-only";
    left -= extra;
    return cut(index, "full");
  });
  const lines = fits.map((fit, index) => (fit === "name-only" ? named[index] : full[index]) as string);
  return { lines, fits, budget, used: budget - left };
};

// Codex 0.171: 2% of the model's whole window in tokens of four bytes, 8,000 characters for a model it doesn't
// know. gpt-5.5 has 272,000, of which the rollout names the 258,400 it lets a turn use. A description longer
// than 1,024 characters is cut first.
export const CODEX_LISTING_TOKENS = Math.floor((272_000 * 2) / 100);
const CODEX_DESCRIPTION = 1024;
const bytes = (text: string) => new TextEncoder().encode(text).length;
const cost = (line: string) => Math.ceil(bytes(`${line}\n`) / 4);

const codexDescription = (description: string) =>
  [...description].length > CODEX_DESCRIPTION
    ? `${[...description].slice(0, CODEX_DESCRIPTION - 3).join("")}...`
    : description;

const codexLine = (skill: ListedSkill, description: string) => {
  const locator = skill.locator ?? `(file: r0/${skill.name}/SKILL.md)`;
  return description === "" ? `- ${skill.name}: ${locator}` : `- ${skill.name}: ${description} ${locator}`;
};

// Everything when it fits. Otherwise each skill keeps its name and the descriptions share what is left, a
// character at a time round the list, so none takes it all. When even the names don't fit, the rest goes.
export const codexListing = (skills: readonly ListedSkill[], budget = CODEX_LISTING_TOKENS): Listing => {
  const descriptions = skills.map((skill) => [...codexDescription(skill.description)]);
  const full = skills.map((skill, index) => codexLine(skill, (descriptions[index] as string[]).join("")));
  const capped = (index: number) => [...(skills[index] as ListedSkill).description].length > CODEX_DESCRIPTION;
  const fullCost = full.reduce((sum, line) => sum + cost(line), 0);
  if (fullCost <= budget) {
    const fits = skills.map((_, index): Fit => (capped(index) ? "shortened" : "full"));
    return { lines: full, fits, budget, used: fullCost };
  }
  const minimum = skills.map((skill) => cost(codexLine(skill, "")));
  const minimumCost = minimum.reduce((sum, line) => sum + line, 0);
  if (minimumCost > budget) {
    let used = 0;
    const fits = minimum.map((line): Fit => {
      if (used + line > budget) return "omitted";
      used += line;
      return "name-only";
    });
    const lines = skills.map((skill, index) => (fits[index] === "omitted" ? "" : codexLine(skill, "")));
    return { lines, fits, budget, used };
  }
  const chars = skills.map(() => 0);
  const spent = [...minimum];
  let left = budget - minimumCost;
  for (let changed = true; changed; ) {
    changed = false;
    skills.forEach((skill, index) => {
      const description = descriptions[index] as string[];
      if ((chars[index] as number) >= description.length) return;
      const next = cost(codexLine(skill, description.slice(0, (chars[index] as number) + 1).join("")));
      const delta = next - (spent[index] as number);
      if (delta > left) return;
      chars[index] = (chars[index] as number) + 1;
      spent[index] = next;
      left -= delta;
      changed = true;
    });
  }
  const fits = skills.map((_, index): Fit => {
    const kept = chars[index] as number;
    const length = (descriptions[index] as string[]).length;
    if (kept === 0) return "name-only";
    return kept >= length && !capped(index) ? "full" : "shortened";
  });
  const lines = skills.map((skill, index) =>
    codexLine(skill, (descriptions[index] as string[]).slice(0, chars[index]).join("")),
  );
  return { lines, fits, budget, used: budget - left };
};

// L3 sees the project's skills only. The harness's own share the budget too, measured on the versions above:
// Claude Code's 13 bundled entries keep 5,070 characters whatever happens, Codex's four `.system` skills take
// their part of the split like any other, and its root table about 52 tokens.
export const CLAUDE_STATIC_CHARS = CLAUDE_LISTING_CHARS - 5070;
const CODEX_SYSTEM: ListedSkill[] = [
  { name: "imagegen", description: "x".repeat(570), locator: "(file: r0/imagegen/SKILL.md)" },
  { name: "openai-docs", description: "x".repeat(624), locator: "(file: r0/openai-docs/SKILL.md)" },
  { name: "skill-creator", description: "x".repeat(106), locator: "(file: r0/skill-creator/SKILL.md)" },
  { name: "skill-installer", description: "x".repeat(225), locator: "(file: r0/skill-installer/SKILL.md)" },
];

// The project's skills as Codex lists them after its own, as `r1/<folder>`: the answer holds the project's only.
export const codexStaticListing = (skills: readonly ListedSkill[]): Listing => {
  const project = skills.map((skill) => ({ ...skill, locator: skill.locator ?? `(file: r1/${skill.name}/SKILL.md)` }));
  const listing = codexListing([...CODEX_SYSTEM, ...project], CODEX_LISTING_TOKENS - 52);
  return { ...listing, fits: listing.fits.slice(CODEX_SYSTEM.length), lines: listing.lines.slice(CODEX_SYSTEM.length) };
};

// A listed skill as L3 reports it: the tokens of its line as the harness renders it, and what the budget took.
export const listedEntry = (
  skill: { name: string; path: string },
  listing: Listing,
  index: number,
  count: (text: string) => number,
): SkillEntry => {
  const fit = listing.fits[index] ?? "full";
  const line = listing.lines[index] ?? "";
  return {
    name: skill.name,
    path: skill.path,
    ...(fit !== "full" && { listing: fit }),
    tokens: line ? count(line) : 0,
  };
};
