import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { type McpEntry, routeAll } from "../capture/mcp-route.ts";
import type { LaunchContext } from "../capture/model.ts";
import { parseUserMcp, readUserMcp, userMcpFile } from "../capture/user-mcp.ts";
import { copyUserScope, geminiUserScope } from "../capture/user-scope.ts";

// The npm package is one script that Node runs. A Gemini CLI from PATH is an executable of its own.
export const geminiCommand = (binary: string, env: Record<string, string>) =>
  binary.endsWith(".js") ? [Bun.which("node", { PATH: env["PATH"] ?? "" }) ?? "node", binary] : [binary];

// Settings come from the folder the session starts in. The file belongs to the isolated copy, never to the user.
const wrapServers = async (context: LaunchContext) => {
  const file = Bun.file(join(context.dirs.work, context.cwd, ".gemini", "settings.json"));
  if (!(await file.exists())) return;
  const settings = parseUserMcp("gemini-cli", await file.text()) as { mcpServers?: Record<string, McpEntry> };
  if (settings.mcpServers === undefined) return;
  settings.mcpServers = await routeAll(context, settings.mcpServers);
  await Bun.write(file, JSON.stringify(settings, null, 2));
};

// userScope inherit: the user's GEMINI.md, skills, commands, and subagents, their MCP servers behind ctxray,
// and their hooks. Nothing else of their settings: it could pick another auth or another endpoint.
const inheritUser = async (context: LaunchContext, geminiDir: string) => {
  const { user } = context;
  if (!user) return {};
  await copyUserScope(geminiUserScope(user, geminiDir, context.dirs.home));
  const { servers } = await readUserMcp("gemini-cli", user, { from: user.project, to: context.dirs.work });
  const file = Bun.file(userMcpFile("gemini-cli", user));
  const own = (await file.exists()) ? parseUserMcp("gemini-cli", await file.text().catch(() => "{}")) : {};
  return { mcpServers: await routeAll(context, servers), ...(own["hooks"] !== undefined && { hooks: own["hooks"] }) };
};

// The isolation recipe of ADR 0007: API-key auth against the proxy, no usage statistics, no telemetry, no
// update checks, system settings pointed at files that don't exist, the copy trusted for this run only.
export const launchGeminiCli = async (binary: string, context: LaunchContext) => {
  await wrapServers(context);
  const geminiDir = join(context.dirs.home, ".gemini");
  await mkdir(geminiDir, { recursive: true });
  const settings = {
    security: { auth: { selectedType: "gemini-api-key" } },
    privacy: { usageStatisticsEnabled: false },
    telemetry: { enabled: false },
    general: { enableAutoUpdate: false, enableAutoUpdateNotification: false },
    ...(await inheritUser(context, geminiDir)),
  };
  await Bun.write(join(geminiDir, "settings.json"), JSON.stringify(settings, null, 2));
  return {
    command: [
      ...geminiCommand(binary, context.env),
      "-p",
      context.prompt,
      "-m",
      context.model,
      "-o",
      "stream-json",
      // The approval mode changes the tools the model sees: yolo shows them all (ADR 0007).
      "--approval-mode",
      "yolo",
    ],
    env: { ...context.env, ...isolation(context.dirs.home), GOOGLE_GEMINI_BASE_URL: context.baseUrl },
  };
};

const isolation = (home: string) => ({
  GEMINI_CLI_HOME: home,
  GEMINI_CLI_SYSTEM_SETTINGS_PATH: join(home, "system", "settings.json"),
  GEMINI_CLI_SYSTEM_DEFAULTS_PATH: join(home, "system", "system-defaults.json"),
  GEMINI_CLI_TRUSTED_FOLDERS_PATH: join(home, ".gemini", "trustedFolders.json"),
  GEMINI_CLI_TRUST_WORKSPACE: "true",
  GEMINI_CLI_NO_RELAUNCH: "true",
  GEMINI_API_KEY: "ctxray-dummy-key",
  // Node's fetch ignores HTTPS_PROXY without it: a stray request would leave past the egress guard.
  NODE_USE_ENV_PROXY: "1",
});

// `0.68.0`, read with the isolated home, so even a version probe stays out of ~/.gemini.
export const geminiCliVersion = async (binary: string, env: Record<string, string>) => {
  const output = await $`${geminiCommand(binary, env)} --version`
    .env({ ...env, ...isolation(env["HOME"] ?? "") })
    .quiet()
    .text();
  return /(\d+\.\d+\.\d+(?:-[\w.]+)?)/.exec(output)?.[1] ?? output.trim();
};
