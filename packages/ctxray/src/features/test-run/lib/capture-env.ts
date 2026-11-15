import { join } from "node:path";
import type { Config, NetworkSettings } from "#entities/user-config/index.ts";

const PROXY_VARIABLES = ["HTTPS_PROXY", "HTTP_PROXY", "ALL_PROXY", "NO_PROXY"];
export const both = (name: string, value: string) => ({ [name]: value, [name.toLowerCase()]: value });

// MCP servers reach the network the way the user's own tools do: through the user's proxy, not the guard.
export const shimEnvOf = (config: Config, network: NetworkSettings) => {
  const userNetwork = {
    ...(network.httpsProxy && both("HTTPS_PROXY", network.httpsProxy)),
    ...(network.httpProxy && both("HTTP_PROXY", network.httpProxy)),
    ...(network.noProxy.length > 0 && both("NO_PROXY", network.noProxy.join(","))),
  };
  return {
    env: userNetwork,
    unset: PROXY_VARIABLES.flatMap((name) => [name, name.toLowerCase()]).filter((name) => !(name in userNetwork)),
    patterns: config.redact.patterns.map(({ source, flags }) => ({ source, flags })),
  };
};

// Node-based MCP servers trust the user's CA certificates through one PEM file (ADR 0003).
export const caFileIn = async (dir: string, network: NetworkSettings) => {
  if (network.caFiles.length <= 1) return network.caFiles[0];
  const file = join(dir, "ca.pem");
  await Bun.write(file, (await Promise.all(network.caFiles.map((one) => Bun.file(one).text()))).join("\n"));
  return file;
};
