import type { LaunchContext } from "./model.ts";

// One MCP server as a harness config writes it. ctxray changes only how the harness reaches it.
export type McpEntry = Record<string, unknown>;

const strings = (value: unknown) => (Array.isArray(value) ? value.map(String) : []);

// A local server starts behind the shim, a remote one goes through the proxy: either way ctxray hears every
// message. Commands come split (`command` and `args`: Claude Code, Cursor, Gemini CLI, Codex) or as one array
// (OpenCode). Remote ones carry `url`, or `httpUrl` in Gemini CLI.
export const routeEntry = async (
  { shim, remote }: Pick<LaunchContext, "shim" | "remote">,
  name: string,
  entry: McpEntry,
): Promise<McpEntry> => {
  const routed: McpEntry = { ...entry };
  for (const key of ["url", "httpUrl"]) {
    const url = entry[key];
    if (typeof url === "string") routed[key] = remote(name, url);
  }
  const { command } = entry;
  if (Array.isArray(command) && command.length > 0) {
    routed["command"] = await shim(name, strings(command));
  } else if (typeof command === "string") {
    const [wrapped = command, ...args] = await shim(name, [command, ...strings(entry["args"])]);
    routed["command"] = wrapped;
    routed["args"] = args;
  }
  return routed;
};

export const routeAll = async (
  context: Pick<LaunchContext, "shim" | "remote">,
  servers: Record<string, McpEntry>,
): Promise<Record<string, McpEntry>> => {
  const routed: Record<string, McpEntry> = {};
  for (const [name, entry] of Object.entries(servers)) routed[name] = await routeEntry(context, name, entry);
  return routed;
};
