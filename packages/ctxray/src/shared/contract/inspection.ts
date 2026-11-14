import { z } from "zod";
import { HarnessId } from "./harness.ts";
import { LintRule } from "./lint.ts";
import { CommandEntry, Component, McpServer, Provenance, RuleEntry, SkillEntry } from "./loadout.ts";

export const INSPECTION_SCHEMA_VERSION = 1;

const tokens = z.number().int().nonnegative();

// A static view counts only what it reads from files. The rest stays unknown rather than zero.
export const StaticTokens = z.object({
  known: tokens.describe("The sum of `byComponent`"),
  byComponent: z.partialRecord(Component, tokens),
  unknown: z.array(Component).describe("Components only a captured run can count"),
  exact: z.literal(false).describe("Local counts are always estimates"),
  method: z.string().describe("`local:<tokenizer>`"),
  calibration: z
    .literal("none")
    .optional()
    .describe("Set when the harness's model has another tokenizer and ctxray has no measured factor for it yet"),
});
export type StaticTokens = z.infer<typeof StaticTokens>;

export const InspectedProblem = z.object({
  severity: z.enum(["error", "warning"]),
  key: z.string().describe("Stable message id, like `lint.brokenLink`"),
  rule: LintRule.optional().describe("The check that found it, as `lint.rules` in the config names it"),
  message: z.string().describe("The message in the language of the run"),
  path: z.string(),
  line: z.number().int().positive().optional(),
});
export type InspectedProblem = z.infer<typeof InspectedProblem>;

export const HarnessInspection = z.object({
  harness: HarnessId,
  mode: z.literal("static"),
  cwd: z.string().describe("Where the agent starts, relative to the project root"),
  files: z.array(z.string()).describe("Files the agent works with, relative to the project root"),
  rules: z.array(RuleEntry),
  skills: z.object({ listed: z.array(SkillEntry), loaded: z.array(SkillEntry) }),
  mcp: z.object({ servers: z.array(McpServer) }),
  commands: z.array(CommandEntry),
  tokens: StaticTokens,
  provenance: z
    .record(z.string(), Provenance)
    .describe("`rule:<path>`, `skill:<name>`, `mcp:<name>`, `command:<name>`"),
  problems: z.array(InspectedProblem).describe("L1 lint and the dead rules of L3"),
});
export type HarnessInspection = z.infer<typeof HarnessInspection>;

// What `ctxray inspect --json` prints.
export const Inspection = z.object({
  schemaVersion: z.literal(INSPECTION_SCHEMA_VERSION),
  harnesses: z.array(HarnessInspection),
  unsupported: z.array(HarnessId).describe("Asked for, but ctxray can't read their files yet"),
});
export type Inspection = z.infer<typeof Inspection>;
