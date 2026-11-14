import { z } from "zod";
import { Activation } from "./activation.ts";
import { CaptureMode, HarnessInfo } from "./harness.ts";

export const LOADOUT_SCHEMA_VERSION = 1;

export const Component = z.enum(["system", "rules", "skills", "mcp", "commands", "tools"]);
export type Component = z.infer<typeof Component>;

const tokens = z.number().int().nonnegative().describe("Tokens, counted as `tokens.method` says");

export const SystemSection = z.object({
  id: z.string().describe("Stable id within the snapshot, the key into `provenance`"),
  title: z.string().optional(),
  tokens,
});

export const RuleEntry = z.object({
  path: z.string().describe("Path relative to the project root"),
  activation: Activation,
  reason: z.string().describe("Why it loaded, like `glob:**/payments/**/*.kt` or `cwd:app`"),
  tokens,
});
export type RuleEntry = z.infer<typeof RuleEntry>;

export const SkillEntry = z.object({ name: z.string(), path: z.string(), tokens });
export type SkillEntry = z.infer<typeof SkillEntry>;

export const McpServer = z.object({ name: z.string(), version: z.string().optional() });
export type McpServer = z.infer<typeof McpServer>;
export const McpTool = z.object({ server: z.string(), name: z.string(), tokens });
export type McpTool = z.infer<typeof McpTool>;

export const CommandEntry = z.object({ name: z.string(), path: z.string().optional() });
export type CommandEntry = z.infer<typeof CommandEntry>;

export const TokenSummary = z.object({
  total: tokens,
  byComponent: z.partialRecord(Component, tokens),
  byMcpServer: z.record(z.string(), tokens),
  exact: z.boolean().describe("True only when a provider counted the tokens; false for any local estimate"),
  method: z.string().describe("`provider:<api>` or `local:<tokenizer>`"),
});

export const Provenance = z.object({
  source: z.string().describe("The file the chunk came from"),
  reason: z.string(),
  evidence: z.enum(["static", "marker", "fingerprint", "canary"]).describe("How ctxray tied the chunk to its file"),
});

export const LoadoutSnapshot = z.object({
  schemaVersion: z.literal(LOADOUT_SCHEMA_VERSION),
  harness: HarnessInfo,
  mode: CaptureMode,
  system: z.array(SystemSection),
  rules: z.array(RuleEntry),
  skills: z.object({
    listed: z.array(SkillEntry).describe("Skills the model sees by name and description"),
    loaded: z.array(SkillEntry).describe("Skills whose body got into the context"),
  }),
  mcp: z.object({ servers: z.array(McpServer), tools: z.array(McpTool) }),
  commands: z.array(CommandEntry),
  tokens: TokenSummary,
  provenance: z.record(z.string(), Provenance).describe("Chunk id (`system:<id>`, `rule:<path>`, …) to its source"),
});
export type LoadoutSnapshot = z.infer<typeof LoadoutSnapshot>;
