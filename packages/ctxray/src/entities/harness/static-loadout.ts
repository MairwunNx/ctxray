import type {
  Activation,
  CommandEntry,
  Component,
  HarnessId,
  McpServer,
  McpTool,
  RuleEntry,
  SkillEntry,
} from "#shared/contract/index.ts";
import { counterFor, type ModelFamily, type TokenCounter } from "#shared/tokens/index.ts";

// Where the agent starts and which files it works with, both relative to the project root.
export type Scope = { cwd: string; files: readonly string[] };

// What L3 predicts the harness loads. Without a run it knows no system prompt, tools, or MCP schemas,
// so their tokens stay unknown rather than zero.
export type StaticLoadout = {
  harness: HarnessId;
  cwd: string;
  rules: RuleEntry[];
  skills: { listed: SkillEntry[]; loaded: SkillEntry[] };
  mcp: { servers: McpServer[]; tools: McpTool[] };
  commands: CommandEntry[];
  tokens: {
    byComponent: Partial<Record<Component, number>>;
    exact: false;
    method: string;
    // Claude has its own tokenizer, and ctxray has no measured factor from o200k to it yet (ADR 0012).
    calibration?: "none";
  };
};

// The listing line both harnesses show the model for a skill or a command.
export const listingLine = (name: string, description: string): string => `- ${name}: ${description}`;

// The model family a harness runs by default.
export const familyOf = (harness: HarnessId): ModelFamily => {
  if (harness === "gemini-cli") return "google";
  return harness === "claude-code" || harness === "claude-code-desktop" ? "anthropic" : "other";
};

// The tokenizer for a harness's model family (ADR 0012): Gemma's vocabulary for Gemini CLI, o200k for the rest,
// scaled to Claude once ctxray has measured factors.
export const tokenCounterOf = (harness: HarnessId): TokenCounter => counterFor(familyOf(harness));

export const createRules = (counter: TokenCounter) => {
  const rules: RuleEntry[] = [];
  const add = (path: string, activation: Activation, reason: string, text: string) => {
    if (!rules.some((rule) => rule.path === path))
      rules.push({ path, activation, reason, tokens: counter.count(text) });
  };
  return { rules, add };
};

type Parts = Omit<StaticLoadout, "tokens">;

const sum = (entries: readonly { tokens: number }[]) => entries.reduce((total, entry) => total + entry.tokens, 0);

type Calibration = Pick<StaticLoadout["tokens"], "calibration">;

export const withTokens = (
  parts: Parts,
  commandLines: readonly string[],
  calibration: Calibration = {},
  counter: TokenCounter = tokenCounterOf(parts.harness),
): StaticLoadout => ({
  ...parts,
  tokens: {
    ...calibration,
    byComponent: {
      rules: sum(parts.rules),
      skills: sum(parts.skills.listed),
      commands: counter.count(commandLines.join("\n")),
    },
    exact: false,
    method: counter.method,
  },
});
