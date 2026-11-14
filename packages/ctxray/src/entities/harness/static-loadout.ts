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
import { countTokens, LOCAL_METHOD } from "#shared/tokens/index.ts";

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
  tokens: { byComponent: Partial<Record<Component, number>>; exact: false; method: string };
};

// The listing line both harnesses show the model for a skill or a command.
export const listingLine = (name: string, description: string): string => `- ${name}: ${description}`;

export const createRules = () => {
  const rules: RuleEntry[] = [];
  const add = (path: string, activation: Activation, reason: string, text: string) => {
    if (!rules.some((rule) => rule.path === path)) rules.push({ path, activation, reason, tokens: countTokens(text) });
  };
  return { rules, add };
};

type Parts = Omit<StaticLoadout, "tokens">;

const sum = (entries: readonly { tokens: number }[]) => entries.reduce((total, entry) => total + entry.tokens, 0);

export const withTokens = (parts: Parts, commandLines: readonly string[]): StaticLoadout => ({
  ...parts,
  tokens: {
    byComponent: {
      rules: sum(parts.rules),
      skills: sum(parts.skills.listed),
      commands: countTokens(commandLines.join("\n")),
    },
    exact: false,
    method: LOCAL_METHOD,
  },
});
