import { realpath } from "node:fs/promises";
import { join, relative } from "node:path";
import type { HarnessId } from "#shared/contract/index.ts";
import type { McpEntry } from "./mcp-route.ts";
import type { UserScope } from "./user-scope.ts";

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const entries = (value: unknown) => record(value) as Record<string, McpEntry>;

// Where each harness keeps the MCP servers a user added for every project.
export const userMcpFile = (harness: HarnessId, { home, env }: UserScope): string => {
  const xdg = env["XDG_CONFIG_HOME"] || join(home, ".config");
  switch (harness) {
    case "claude-code":
      return join(env["CLAUDE_CONFIG_DIR"] || home, ".claude.json");
    case "claude-code-desktop":
      return process.platform === "win32"
        ? join(env["APPDATA"] || join(home, "AppData", "Roaming"), "Claude", "claude_desktop_config.json")
        : process.platform === "darwin"
          ? join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json")
          : join(xdg, "Claude", "claude_desktop_config.json");
    case "codex":
      return join(env["CODEX_HOME"] || join(home, ".codex"), "config.toml");
    case "cursor-cli":
    case "cursor-ide":
      return join(home, ".cursor", "mcp.json");
    case "gemini-cli":
      return join(home, ".gemini", "settings.json");
    case "opencode":
      return join(xdg, "opencode", "opencode.json");
  }
};

const KEYS: Record<HarnessId, string> = {
  "claude-code": "mcpServers",
  "claude-code-desktop": "mcpServers",
  codex: "mcp_servers",
  "cursor-cli": "mcpServers",
  "cursor-ide": "mcpServers",
  "gemini-cli": "mcpServers",
  opencode: "mcp",
};

// The user's servers, and for Claude Code also the ones it keeps per project (`claude mcp add -s local`),
// moved from the user's real project to the run's copy. Servers of other projects stay out.
export type UserMcp = { servers: Record<string, McpEntry>; projects: Record<string, Record<string, McpEntry>> };

export const parseUserMcp = (harness: HarnessId, text: string): Record<string, unknown> =>
  record(harness === "codex" ? Bun.TOML.parse(text) : JSON.parse(text));

export const readUserMcp = async (
  harness: HarnessId,
  scope: UserScope,
  copy: { from: string; to: string }, // the user's project root and the run's copy of it
): Promise<UserMcp> => {
  const file = Bun.file(userMcpFile(harness, scope));
  if (!(await file.exists())) return { servers: {}, projects: {} };
  let raw: Record<string, unknown>;
  try {
    raw = parseUserMcp(harness, await file.text());
  } catch {
    return { servers: {}, projects: {} }; // the harness itself would refuse the file too
  }
  const projects: UserMcp["projects"] = {};
  if (harness === "claude-code") {
    const root = await realpath(copy.from).catch(() => copy.from);
    for (const [path, project] of Object.entries(record(raw["projects"]))) {
      const inside = relative(root, path);
      if (inside.startsWith("..") || inside.startsWith("/")) continue;
      const servers = entries(record(project)["mcpServers"]);
      if (Object.keys(servers).length > 0) projects[join(copy.to, inside)] = servers;
    }
  }
  return { servers: entries(raw[KEYS[harness]]), projects };
};
