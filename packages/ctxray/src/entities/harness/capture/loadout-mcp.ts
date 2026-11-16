import type { McpServer, McpTool } from "#shared/contract/index.ts";
import { withoutCanaries } from "./canary.ts";
import type { Count, LoadoutInput } from "./loadout.ts";
import { isOwnServer } from "./own.ts";

// The MCP servers of a request and their tools: the names the wire shows, the schemas the shim heard.
export const mcpOf = (input: LoadoutInput, count: Count) => {
  const wire = input.segments.filter((segment) => segment.component === "mcp");
  const names = new Set([...wire.map((segment) => segment.id.split("/")[0] as string), ...Object.keys(input.servers)]);
  const servers: McpServer[] = [...names].sort().map((name) => {
    const version = input.servers[name]?.info?.version;
    return { name, ...(version && { version }), ...(isOwnServer(name) && { own: true }) };
  });
  const tools: McpTool[] = [];
  const byMcpServer: Record<string, number> = {};
  for (const { name, own } of servers) {
    const record = input.servers[name];
    const inline = (tool: string) => wire.some((segment) => segment.id === `${name}/${tool}` && !segment.deferred);
    const schemas = record?.tools ?? [];
    for (const schema of schemas) {
      tools.push({
        server: name,
        name: schema.name,
        deferred: !inline(schema.name),
        ...(own && { own }),
        tokens: count(JSON.stringify(schema)),
      });
    }
    for (const segment of wire.filter((one) => one.id.startsWith(`${name}/`))) {
      const tool = segment.id.slice(name.length + 1);
      if (!tools.some((known) => known.server === name && known.name === tool)) {
        tools.push({
          server: name,
          name: tool,
          deferred: segment.deferred === true,
          ...(own && { own }),
          tokens: count(withoutCanaries(segment.text)),
        });
      }
    }
    // ctxray's own server is listed, but not counted: totals leave ctxray out.
    if (own) continue;
    const instructions = record?.instructions ? count(record.instructions) : 0;
    byMcpServer[name] = tools
      .filter((tool) => tool.server === name)
      .reduce((sum, tool) => sum + tool.tokens, instructions);
  }
  return { servers, tools, byMcpServer };
};
