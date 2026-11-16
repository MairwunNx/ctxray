import type { HarnessId } from "#shared/contract/index.ts";

// Where each harness looks in a project, from the stage 0 spikes (ADR 0005–0011). It names the harnesses that
// would read a file even when ctxray has no adapter for them yet, so a file for Cursor in a run without Cursor
// reads as “only Cursor reads this”, not as a file nobody reads.
const CLAUDE: HarnessId[] = ["claude-code", "claude-code-desktop"];
const CURSOR: HarnessId[] = ["cursor-cli", "cursor-ide"];

const LOCATIONS: { pattern: RegExp; readers: HarnessId[] }[] = [
  // Cursor and OpenCode take CLAUDE.md too, OpenCode where a folder has no AGENTS.md.
  { pattern: /(^|\/)CLAUDE(\.local)?\.md$/, readers: [...CLAUDE, ...CURSOR, "opencode"] },
  { pattern: /(^|\/)AGENTS\.md$/, readers: ["codex", "opencode", ...CURSOR, ...CLAUDE] },
  { pattern: /(^|\/)AGENTS\.override\.md$/, readers: ["codex"] },
  { pattern: /(^|\/)GEMINI\.md$/, readers: ["gemini-cli"] },
  { pattern: /(^|\/)\.cursorrules$/, readers: CURSOR },
  { pattern: /(^|\/)\.claude\/rules\/.+\.md$/, readers: CLAUDE },
  { pattern: /(^|\/)\.cursor\/rules\/.+\.[mM][dD][cC]$/, readers: CURSOR },
  { pattern: /(^|\/)\.claude\/skills\/[^/]+\/SKILL\.md$/, readers: [...CLAUDE, ...CURSOR, "opencode"] },
  { pattern: /(^|\/)\.agents\/skills\/[^/]+\/SKILL\.md$/, readers: ["codex", ...CURSOR, "opencode", "gemini-cli"] },
  { pattern: /(^|\/)\.codex\/skills\/[^/]+\/SKILL\.md$/, readers: ["codex", ...CURSOR] },
  { pattern: /(^|\/)\.cursor\/skills\/[^/]+\/SKILL\.md$/, readers: CURSOR },
  { pattern: /(^|\/)\.opencode\/skills?\/.+\/SKILL\.md$/, readers: ["opencode"] },
  // A skill a folder deeper, like .agents/skills/payments/refunds/SKILL.md: Claude Code and Gemini CLI look
  // one level down only (spike 0017).
  { pattern: /(^|\/)\.claude\/skills\/[^/]+\/.+\/SKILL\.md$/, readers: [...CURSOR, "opencode"] },
  { pattern: /(^|\/)\.agents\/skills\/[^/]+\/.+\/SKILL\.md$/, readers: ["codex", ...CURSOR, "opencode"] },
  { pattern: /(^|\/)\.codex\/skills\/[^/]+\/.+\/SKILL\.md$/, readers: ["codex", ...CURSOR] },
  { pattern: /(^|\/)\.cursor\/skills\/[^/]+\/.+\/SKILL\.md$/, readers: CURSOR },
  { pattern: /(^|\/)\.gemini\/skills\/[^/]+\/SKILL\.md$/, readers: ["gemini-cli"] },
  { pattern: /(^|\/)\.claude\/(commands|agents)\/.+\.md$/, readers: CLAUDE },
  { pattern: /(^|\/)\.gemini\/(commands\/.+\.toml|agents\/.+\.md)$/, readers: ["gemini-cli"] },
  { pattern: /(^|\/)\.opencode\/(commands?|agents?)\/.+\.md$/, readers: ["opencode"] },
  { pattern: /(^|\/)\.cursor\/(commands|agents)\/.+\.md$/, readers: CURSOR },
];

// Every harness that reads the file by its location, configured for the run or not.
export const readersOf = (path: string): HarnessId[] => [
  ...new Set(LOCATIONS.filter(({ pattern }) => pattern.test(path)).flatMap(({ readers }) => readers)),
];

// Files agents read by their place: the reach check looks at each of them.
export const isAgentFile = (path: string) => LOCATIONS.some(({ pattern }) => pattern.test(path));

// Config files, MCP servers among what they declare. The harness opens each by its exact name.
const CONFIGS: { pattern: RegExp; readers: HarnessId[] }[] = [
  { pattern: /^\.mcp\.json$/, readers: CLAUDE },
  { pattern: /(^|\/)\.cursor\/mcp\.json$/, readers: CURSOR },
  { pattern: /(^|\/)\.codex\/config\.toml$/, readers: ["codex"] },
  { pattern: /(^|\/)\.gemini\/settings\.json$/, readers: ["gemini-cli"] },
  { pattern: /(^|\/)(\.opencode\/)?opencode\.jsonc?$/, readers: ["opencode"] },
];

export const configReadersOf = (path: string): HarnessId[] =>
  CONFIGS.filter(({ pattern }) => pattern.test(path)).flatMap(({ readers }) => readers);
