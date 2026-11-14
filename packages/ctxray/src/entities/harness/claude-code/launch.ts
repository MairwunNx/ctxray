import { join } from "node:path";
import { $ } from "bun";
import type { LaunchContext } from "../capture/model.ts";

type McpEntry = { command?: string; args?: string[]; type?: string; url?: string; [key: string]: unknown };

// Project MCP servers run behind the shim, remote ones behind the proxy. The file belongs to the isolated
// copy, never to the user.
const wrapServers = async ({ dirs, shim, remote }: LaunchContext) => {
  const file = Bun.file(join(dirs.work, ".mcp.json"));
  if (!(await file.exists())) return;
  const config = (await file.json()) as { mcpServers?: Record<string, McpEntry> };
  for (const [name, server] of Object.entries(config.mcpServers ?? {})) {
    if (server.url !== undefined) {
      config.mcpServers = { ...config.mcpServers, [name]: { ...server, url: remote(name, server.url) } };
      continue;
    }
    if (server.command === undefined) continue;
    const [command = server.command, ...args] = await shim(name, [server.command, ...(server.args ?? [])]);
    config.mcpServers = { ...config.mcpServers, [name]: { ...server, command, args } };
  }
  await Bun.write(file, JSON.stringify(config, null, 2));
};

// The isolation recipe of ADR 0005: a config dir of its own, the proxy as base URL, a dummy key, and every
// switch that stops Claude Code from phoning home.
export const launchClaudeCode = async (binary: string, context: LaunchContext) => {
  await wrapServers(context);
  return {
    command: [
      binary,
      "-p",
      context.prompt,
      "--output-format",
      "stream-json",
      "--verbose",
      "--model",
      context.model,
      "--permission-mode",
      "bypassPermissions",
    ],
    env: {
      ...context.env,
      CLAUDE_CONFIG_DIR: join(context.dirs.home, ".claude-config"),
      ANTHROPIC_BASE_URL: context.baseUrl,
      ANTHROPIC_API_KEY: "ctxray-dummy-key",
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
      DISABLE_TELEMETRY: "1",
      DISABLE_ERROR_REPORTING: "1",
      DISABLE_AUTOUPDATER: "1",
      CLAUDE_CODE_DISABLE_OFFICIAL_MARKETPLACE_AUTOINSTALL: "1",
    },
  };
};

// `2.1.311 (Claude Code)`, read with the isolated environment, so even a version probe stays out of ~/.claude.
export const claudeCodeVersion = async (binary: string, env: Record<string, string>) => {
  const output = await $`${binary} --version`.env(env).quiet().text();
  return /^(\d+\.\d+\.\d+)/.exec(output.trim())?.[1] ?? output.trim();
};
