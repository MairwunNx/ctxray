import { join } from "node:path";
import { CAPTURE_ADAPTERS, userMcpFile } from "#entities/harness/index.ts";
import type { HarnessId } from "#shared/contract/index.ts";
import type { Env } from "#shared/infra/index.ts";

// Where ctxray goes in an agent's config: the file, the key that holds MCP servers, and its entry there.
export type Target = { file: string; key: string; entry: Record<string, unknown> };

const STDIO = { command: "ctxray", args: ["mcp"] };
const OPENCODE = { type: "local", command: ["ctxray", "mcp"] };

// OpenCode reads opencode.jsonc as well: a file that's already there wins.
const opencodeFile = async (dir: string) =>
  (await Bun.file(join(dir, "opencode.jsonc")).exists()) && !(await Bun.file(join(dir, "opencode.json")).exists())
    ? join(dir, "opencode.jsonc")
    : join(dir, "opencode.json");

export const projectTarget = async (agent: HarnessId, root: string): Promise<Target> => {
  switch (agent) {
    case "claude-code":
      return { file: join(root, ".mcp.json"), key: "mcpServers", entry: STDIO };
    case "codex":
      return { file: join(root, ".codex", "config.toml"), key: "mcp_servers", entry: STDIO };
    case "gemini-cli":
      return { file: join(root, ".gemini", "settings.json"), key: "mcpServers", entry: STDIO };
    case "opencode":
      return { file: await opencodeFile(root), key: "mcp", entry: OPENCODE };
    case "cursor-cli":
      return { file: join(root, ".cursor", "mcp.json"), key: "mcpServers", entry: STDIO };
  }
};

export const userTarget = async (agent: HarnessId, home: string, env: Env): Promise<Target> => {
  const file = userMcpFile(agent, { home, env });
  const project = await projectTarget(agent, home);
  if (agent === "opencode") return { ...project, file: await opencodeFile(join(file, "..")) };
  return { ...project, file };
};

// Claude Code, Codex, and Gemini CLI add servers to the user's config themselves, so ctxray asks them to.
const USER_ARGS: Partial<Record<HarnessId, readonly string[]>> = {
  "claude-code": ["mcp", "add", "--scope", "user", "ctxray", "--", "ctxray", "mcp"],
  codex: ["mcp", "add", "ctxray", "--", "ctxray", "mcp"],
  "gemini-cli": ["mcp", "add", "--scope", "user", "ctxray", "ctxray", "mcp"],
};

export const userCommand = (agent: HarnessId) => {
  const args = USER_ARGS[agent];
  const binary = CAPTURE_ADAPTERS[agent]?.binary;
  return args && binary ? { binary, args } : undefined;
};
