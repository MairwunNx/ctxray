import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import type { LaunchContext } from "../capture/model.ts";

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

type Server = { command?: string; args?: string[] };

// Project MCP servers run behind the shim. `-c` overrides beat the project file, which stays as it is.
const serverOverrides = async ({ dirs, shim }: LaunchContext): Promise<string[]> => {
  const file = Bun.file(join(dirs.work, ".codex/config.toml"));
  if (!(await file.exists())) return [];
  const servers = (Bun.TOML.parse(await file.text()) as { mcp_servers?: Record<string, Server> }).mcp_servers ?? {};
  const overrides: string[] = [];
  for (const [name, server] of Object.entries(servers)) {
    if (server.command === undefined) continue;
    const [command, ...args] = await shim(name, [server.command, ...(server.args ?? [])]);
    const key = `mcp_servers.${name}`;
    overrides.push("-c", `${key}.command=${toml(command)}`, "-c", `${key}.args=${toml(args)}`);
    overrides.push("-c", `${key}.default_tools_approval_mode="approve"`);
  }
  return overrides;
};

export const launchCodex = async (binary: string, context: LaunchContext) => {
  const codexHome = join(context.dirs.home, ".codex");
  await mkdir(codexHome, { recursive: true });
  await Bun.write(join(codexHome, "config.toml"), configOf(context));
  return {
    command: [
      binary,
      "exec",
      "--json",
      "-s",
      "read-only",
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
