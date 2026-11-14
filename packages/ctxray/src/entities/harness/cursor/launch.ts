import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { type McpEntry, routeAll } from "../capture/mcp-route.ts";
import type { LaunchContext } from "../capture/model.ts";
import { readUserMcp } from "../capture/user-mcp.ts";
import { copyUserScope, cursorUserScope } from "../capture/user-scope.ts";
import { chainTo } from "../project.ts";

// Project MCP servers run behind the shim, remote ones behind the proxy. Cursor finds a .cursor/mcp.json in the
// cwd or any folder above it up to the root, so each of them in the isolated copy gets its servers routed.
const wrapServers = async (context: LaunchContext) => {
  for (const dir of chainTo(context.cwd)) {
    const file = Bun.file(join(context.dirs.work, dir, ".cursor", "mcp.json"));
    if (!(await file.exists())) continue;
    const config = (await file.json()) as { mcpServers?: Record<string, McpEntry> };
    config.mcpServers = await routeAll(context, config.mcpServers ?? {});
    await Bun.write(file, JSON.stringify(config, null, 2));
  }
};

// userScope inherit: the user's skills, rules, and commands, and their MCP servers behind ctxray.
const inheritUser = async (context: LaunchContext) => {
  const { user } = context;
  if (!user) return;
  await copyUserScope(cursorUserScope(user, context.dirs.home));
  const { servers } = await readUserMcp("cursor-cli", user, { from: user.project, to: context.dirs.work });
  const dir = join(context.dirs.home, ".cursor");
  await mkdir(dir, { recursive: true });
  await Bun.write(join(dir, "mcp.json"), JSON.stringify({ mcpServers: await routeAll(context, servers) }, null, 2));
};

const isolation = (home: string) => ({
  CURSOR_CONFIG_DIR: join(home, ".cursor"),
  CURSOR_DATA_DIR: join(home, ".cursor-data"),
  // Tokens stay in memory: the standard store on macOS is the login keychain, whatever HOME says.
  AGENT_CLI_CREDENTIAL_STORE: "memory",
  CI: "1",
  NO_OPEN_BROWSER: "1",
});

// Cursor's hidden local build: no Cursor account, no Cursor backend, the whole prompt built on the client and
// sent to the base URL as Chat Completions (ADR 0009). Experimental: Cursor can change or drop it any day.
export const launchCursorCli = async (binary: string, context: LaunchContext) => {
  await wrapServers(context);
  await inheritUser(context);
  return {
    command: [
      binary,
      "--authless",
      "--base-url",
      `${context.baseUrl}/v1`,
      "-p",
      "--output-format",
      "stream-json",
      "--trust",
      "--approve-mcps",
      "--force",
      "--disable-auto-update",
      "--model",
      context.model,
      context.prompt,
    ],
    env: { ...context.env, ...isolation(context.dirs.home) },
  };
};

// `2026.11.13-eacade1`, read with the isolated home and the memory credential store.
export const cursorCliVersion = async (binary: string, env: Record<string, string>) => {
  const output = await $`${binary} --version`
    .env({ ...env, ...isolation(env["HOME"] ?? "") })
    .quiet()
    .text();
  return /(\d{4}\.\d{2}\.\d{2}-\w+)/.exec(output)?.[1] ?? output.trim();
};
