import type { McpServer, McpTool } from "#shared/contract/index.ts";
import { withoutCanaries } from "./canary.ts";
import type { Count, LoadoutInput } from "./loadout.ts";

// The MCP servers of a request and their tools: the names the wire shows, the schemas the shim heard.
export const mcpOf = (input: LoadoutInput, count: Count) => {
  const wire = input.segments.filter((segment) => segment.component === "mcp");
  const names = new Set([...wire.map((segment) => segment.id.split("/")[0] as string), ...Object.keys(input.servers)]);
  const servers: McpServer[] = [...names].sort().map((name) => {
    const version = input.servers[name]?.info?.version;
    return version ? { name, version } : { name };
  });
  const tools: McpTool[] = [];
  const byMcpServer: Record<string, number> = {};
  for (const { name } of servers) {
    const record = input.servers[name];
    const inline = (tool: string) => wire.some((segment) => segment.id === `${name}/${tool}` && !segment.deferred);
    const schemas = record?.tools ?? [];
    for (const schema of schemas) {
      tools.push({
        server: name,
        name: schema.name,
        deferred: !inline(schema.name),
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
          tokens: count(withoutCanaries(segment.text)),
        });
      }
    }
    const instructions = record?.instructions ? count(record.instructions) : 0;
    byMcpServer[name] = tools
      .filter((tool) => tool.server === name)
      .reduce((sum, tool) => sum + tool.tokens, instructions);
  }
  return { servers, tools, byMcpServer };
};
