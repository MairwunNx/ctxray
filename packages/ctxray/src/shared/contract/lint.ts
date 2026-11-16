import { z } from "zod";
import { HarnessId } from "./harness.ts";
import { Limits } from "./limits.ts";

// Every L1 check by a stable id, the one the output shows next to a finding and the config names.
export const LINT_RULES = [
  "frontmatter",
  "loose-frontmatter",
  "rule-field",
  "too-large",
  "import-missing",
  "import-depth",
  "shadowed-command",
  "no-description",
  "long-description",
  "bad-json",
  "bad-toml",
  "mcp-transport",
  "empty-file",
  "shadowed-file",
  "skill-field",
  "codex-budget",
  "bad-glob",
  "skill-name",
  "skill-folder-name",
  "duplicate-skill",
  "duplicate-text",
  "broken-link",
  "byte-order-mark",
  "dead-rule",
  "size",
  "unread",
  "other-harness",
  "harness-differences",
] as const;
export const LintRule = z.enum(LINT_RULES);
export type LintRule = z.infer<typeof LintRule>;

export const LintLevel = z.enum(["error", "warning", "off"]).describe("`off` drops the check");
export type LintLevel = z.infer<typeof LintLevel>;

const Setting = z.union([LintLevel, z.strictObject({ level: LintLevel })]);
const Rules = z.partialRecord(LintRule, Setting).describe("The level of each check, by its id");
const Globs = z.array(z.string().min(1));

export const LintOverride = z.strictObject({
  include: Globs.min(1).describe("Files the override applies to, as globs from the project root"),
  harnesses: z.array(HarnessId).optional().describe("Harnesses it applies to, all by default"),
  rules: Rules.optional(),
  limits: Limits.optional().describe("Size limits for these files, over the project's"),
});

export const LintConfig = z
  .strictObject({
    rules: Rules.optional(),
    ignore: Globs.optional().describe("Files L1 skips entirely, as globs from the project root"),
    errorOnWarnings: z.boolean().optional().describe("Every warning fails the run, as an error would"),
    overrides: z.array(LintOverride).optional().describe("Later overrides win over earlier ones"),
  })
  .describe("How L1 checks the project: like Biome's linter config");
export type LintConfig = z.output<typeof LintConfig>;
