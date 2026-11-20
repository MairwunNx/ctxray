import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { routeAll } from "../capture/mcp-route.ts";
import type { LaunchContext } from "../capture/model.ts";
import { readUserMcp } from "../capture/user-mcp.ts";
import { codexUserScope, copyUserScope } from "../capture/user-scope.ts";
import { tomlTable } from "./toml.ts";

const toml = (value: unknown) => JSON.stringify(value);

// The generated config of ADR 0006: ctxray as the only provider, plugins, analytics, history, and update
// checks off, the copy trusted so its own `.codex/config.toml` counts.
const configOf = (context: LaunchContext) =>
  [
    'model_provider = "ctxray"',
    "check_for_update_on_startup = false",
    "",
    "[model_providers.ctxray]",
    'name = "ctxray"',
    `base_url = ${toml(`${context.baseUrl}/v1`)}`,
    'env_key = "CTXRAY_PROVIDER_KEY"',
    'wire_api = "responses"',
    "request_max_retries = 0",
    "stream_max_retries = 0",
    "",
    "[features]",
    "plugins = false",
    "remote_plugin = false",
    "",
    "[analytics]",
    "enabled = false",
    "[feedback]",
    "enabled = false",
    "[history]",
    'persistence = "none"',
    "[otel]",
    'exporter = "none"',
    "",
    `[projects.${toml(context.dirs.work)}]`,
    'trust_level = "trusted"',
    "",
  ].join("\n");

type Server = { command?: string; args?: string[]; url?: string };

// Project MCP servers run behind the shim. `-c` overrides beat the project file, which stays as it is.
// Server names with a dot can't be overridden this way: Codex splits `-c` keys at dots.
const serverOverrides = async ({ dirs, shim, remote }: LaunchContext): Promise<string[]> => {
  const file = Bun.file(join(dirs.work, ".codex/config.toml"));
  if (!(await file.exists())) return [];
  const servers = (Bun.TOML.parse(await file.text()) as { mcp_servers?: Record<string, Server> }).mcp_servers ?? {};
  const overrides: string[] = [];
  for (const [name, server] of Object.entries(servers)) {
    const key = `mcp_servers.${name}`;
    if (server.url !== undefined) overrides.push("-c", `${key}.url=${toml(remote(name, server.url))}`);
    if (server.command === undefined) continue;
    const [command, ...args] = await shim(name, [server.command, ...(server.args ?? [])]);
    overrides.push("-c", `${key}.command=${toml(command)}`, "-c", `${key}.args=${toml(args)}`);
    overrides.push("-c", `${key}.default_tools_approval_mode="approve"`);
  }
  return overrides;
};

// userScope inherit: the user's skills, AGENTS.md, and hooks, and their MCP servers behind ctxray as tables
// of the run's config.toml. A project server of the same name wins, as it does in Codex.
const userServers = async (context: LaunchContext) => {
  const { user } = context;
  if (!user) return "";
  const codexHome = join(context.dirs.home, ".codex");
  await copyUserScope(codexUserScope(user, codexHome, context.dirs.home));
  const { servers } = await readUserMcp("codex", user, { from: user.project, to: context.dirs.work });
  const routed = await routeAll(context, servers);
  return Object.entries(routed)
    .map(([name, entry]) => tomlTable(["mcp_servers", name], { ...entry, default_tools_approval_mode: "approve" }))
    .join("\n");
};

export const launchCodex = async (binary: string, context: LaunchContext) => {
  const codexHome = join(context.dirs.home, ".codex");
  await mkdir(codexHome, { recursive: true });
  await Bun.write(join(codexHome, "config.toml"), configOf(context) + (await userServers(context)));
  return {
    command: [
      binary,
      "exec",
      "--json",
      // The run works on a copy of the project: the agent may change it, the way a scenario needs.
      "-s",
      "workspace-write",
      "-m",
      context.model,
      "--skip-git-repo-check",
      ...(await serverOverrides(context)),
      context.prompt,
    ],
    env: { ...context.env, CODEX_HOME: codexHome, CTXRAY_PROVIDER_KEY: "ctxray-dummy-key" },
  };
};

// `codex-cli 0.169.0`. Even `--version` writes into CODEX_HOME, so it runs in the isolated one (ADR 0006).
export const codexVersion = async (binary: string, env: Record<string, string>) => {
  const home = join(env["HOME"] ?? "", ".codex");
  await mkdir(home, { recursive: true });
  const output = await $`${binary} --version`
    .env({ ...env, CODEX_HOME: home })
    .quiet()
    .text();
  return /(\d+\.\d+\.\d+)/.exec(output)?.[1] ?? output.trim();
};
