import { realpath } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { type McpEntry, routeAll } from "../capture/mcp-route.ts";
import type { LaunchContext } from "../capture/model.ts";
import { readUserMcp } from "../capture/user-mcp.ts";
import { claudeUserScope, copyUserScope } from "../capture/user-scope.ts";

// Project MCP servers run behind the shim, remote ones behind the proxy. The file belongs to the isolated
// copy, never to the user.
const wrapServers = async (context: LaunchContext) => {
  const file = Bun.file(join(context.dirs.work, ".mcp.json"));
  if (!(await file.exists())) return;
  const config = (await file.json()) as { mcpServers?: Record<string, McpEntry> };
  config.mcpServers = await routeAll(context, config.mcpServers ?? {});
  await Bun.write(file, JSON.stringify(config, null, 2));
};

// userScope inherit: the user's MCP servers, for every project and for this one, go into the run's
// .claude.json behind ctxray, and the hooks of their settings into the run's settings.json. Nothing else of
// the settings comes along: it could point the harness past ctxray.
const inheritUser = async (context: LaunchContext, configDir: string) => {
  const { user } = context;
  if (!user) return;
  await copyUserScope(claudeUserScope(user, configDir));
  const work = await realpath(context.dirs.work);
  const mcp = await readUserMcp("claude-code", user, { from: user.project, to: work });
  const projects: Record<string, { mcpServers: Record<string, McpEntry> }> = {};
  for (const [path, servers] of Object.entries(mcp.projects))
    projects[path] = { mcpServers: await routeAll(context, servers) };
  await Bun.write(
    join(configDir, ".claude.json"),
    JSON.stringify({ mcpServers: await routeAll(context, mcp.servers), projects }, null, 2),
  );
  const settings = Bun.file(join(user.env["CLAUDE_CONFIG_DIR"] || join(user.home, ".claude"), "settings.json"));
  const hooks = (await settings.exists())
    ? ((await settings.json().catch(() => ({}))) as { hooks?: unknown }).hooks
    : undefined;
  if (hooks !== undefined) await Bun.write(join(configDir, "settings.json"), JSON.stringify({ hooks }, null, 2));
};

// The isolation recipe of ADR 0005: a config dir of its own, the proxy as base URL, a dummy key, and every
// switch that stops Claude Code from phoning home.
export const launchClaudeCode = async (binary: string, context: LaunchContext) => {
  await wrapServers(context);
  const configDir = join(context.dirs.home, ".claude-config");
  await inheritUser(context, configDir);
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
      CLAUDE_CONFIG_DIR: configDir,
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
