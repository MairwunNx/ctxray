import type { HarnessId } from "#shared/contract/index.ts";
import type { MessageKey } from "#shared/i18n/index.ts";

export type Severity = "error" | "warning";

// A finding about one file. `key` is a catalog key, so the CLI words it in the user's language.
export type Problem = {
  key: MessageKey;
  severity: Severity;
  path: string;
  line?: number;
  params: Readonly<Record<string, string | number>>;
};

// A file the harness puts into context as instructions. `dir` is the directory it belongs to: CLAUDE.md
// and AGENTS.md apply to their own directory, a rule to the directory that holds its `.claude/`.
export type Instruction = {
  path: string;
  dir: string;
  kind: "memory" | "local" | "agents" | "rule" | "import";
  // A rule with globs loads only for matching files, relative to `dir`.
  globs?: readonly string[];
  // Files it pulls in with `@path`, relative to the root.
  imports: readonly string[];
  text: string;
};

export type Skill = {
  name: string;
  path: string;
  dir: string;
  description: string;
  // Whether the model sees it. A skill only the user can call stays out of the listing.
  listed: boolean;
  globs?: readonly string[];
  body: string;
};

export type Command = { name: string; path: string; dir: string; description: string; body: string };

export type McpDeclaration = { name: string; path: string; enabled: boolean };

// Everything a harness could load from the project, found without running it.
export type Inventory = {
  harness: HarnessId;
  instructions: readonly Instruction[];
  skills: readonly Skill[];
  commands: readonly Command[];
  mcp: readonly McpDeclaration[];
  // What discovery itself found wrong, like frontmatter that doesn't parse.
  problems: readonly Problem[];
  // Codex stops adding AGENTS.md files once their bytes reach this budget.
  budget?: number;
};

export const problem = (
  key: MessageKey,
  severity: Severity,
  path: string,
  params: Problem["params"] = {},
  line?: number,
): Problem => (line === undefined ? { key, severity, path, params } : { key, severity, path, params, line });
