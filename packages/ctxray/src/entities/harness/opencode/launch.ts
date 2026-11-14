import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { type McpEntry, routeAll } from "../capture/mcp-route.ts";
import type { LaunchContext } from "../capture/model.ts";
import { parseUserMcp, readUserMcp } from "../capture/user-mcp.ts";
import { copyUserScope, opencodeUserScope } from "../capture/user-scope.ts";
import { chainTo, joinPath } from "../project.ts";

export const CONFIG_NAMES = ["opencode.json", "opencode.jsonc", ".opencode/opencode.json", ".opencode/opencode.jsonc"];

// Project MCP servers run behind the shim, remote ones behind the proxy. OpenCode merges the configs from the
// git root down to the cwd, so each of them in the copy gets its servers routed.
const wrapServers = async (context: LaunchContext) => {
  for (const dir of chainTo(context.cwd)) {
    for (const name of CONFIG_NAMES) {
      const file = Bun.file(join(context.dirs.work, joinPath(dir, name)));
      if (!(await file.exists())) continue;
      const config = parseUserMcp("opencode", await file.text()) as { mcp?: Record<string, McpEntry> };
      if (config.mcp === undefined) continue;
      config.mcp = await routeAll(context, config.mcp);
      await Bun.write(file, JSON.stringify(config, null, 2));
    }
  }
};

// userScope inherit: the user's AGENTS.md, skills, commands, and agents, and their MCP servers behind ctxray in
// the run's global config, so a project server of the same name still wins, as it does in OpenCode.
const inheritUser = async (context: LaunchContext) => {
  const { user } = context;
  if (!user) return;
  await copyUserScope(opencodeUserScope(user, context.dirs.home));
  const { servers } = await readUserMcp("opencode", user, { from: user.project, to: context.dirs.work });
  const dir = join(context.dirs.home, ".config", "opencode");
  await mkdir(dir, { recursive: true });
  await Bun.write(join(dir, "opencode.json"), JSON.stringify({ mcp: await routeAll(context, servers) }, null, 2));
};

// The provider OpenCode talks to: its own anthropic or openai one pointed at the proxy, or by default an
// OpenAI-compatible one named ctxray. The base prompt depends on the model, the wire on the provider (ADR 0008).
const providerOf = ({ provider, model, baseUrl }: LaunchContext) => {
  const id = provider === "anthropic" || provider === "openai" ? provider : "ctxray";
  const options = { baseURL: `${baseUrl}/v1`, apiKey: "ctxray-dummy-key" };
  const models = { [model]: { tool_call: true } };
  const own = id === "ctxray" ? { npm: "@ai-sdk/openai-compatible", name: "ctxray" } : {};
  return { id, config: { [id]: { ...own, options, models } } };
};

// The isolation recipe of ADR 0008: the generated config over the project's, no stored credentials, no update
// checks, no model catalogue download, no LSP downloads, and npm offline, so no plugin install leaves the run.
export const launchOpencode = async (binary: string, context: LaunchContext) => {
  await wrapServers(context);
  await inheritUser(context);
  const { id, config } = providerOf(context);
  const settings = {
    autoupdate: false,
    share: "disabled",
    model: `${id}/${context.model}`,
    small_model: `${id}/${context.model}`,
    enabled_providers: [id],
    provider: config,
  };
  return {
    command: [binary, "run", "--format", "json", "-m", `${id}/${context.model}`],
    stdin: context.prompt,
    env: { ...context.env, ...isolation, OPENCODE_CONFIG_CONTENT: JSON.stringify(settings) },
  };
};

const isolation = {
  OPENCODE_AUTH_CONTENT: "{}",
  OPENCODE_DISABLE_AUTOUPDATE: "1",
  OPENCODE_DISABLE_MODELS_FETCH: "1",
  OPENCODE_DISABLE_LSP_DOWNLOAD: "1",
  npm_config_offline: "true",
};

// `1.19.5`. Even `--version` creates OpenCode's folders, so it runs with the run's HOME and XDG folders.
export const opencodeVersion = async (binary: string, env: Record<string, string>) => {
  const output = await $`${binary} --version`
    .env({ ...env, ...isolation })
    .quiet()
    .text();
  return /(\d+\.\d+\.\d+(?:-[\w.]+)?)/.exec(output)?.[1] ?? output.trim();
};
