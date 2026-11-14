// A small MCP server over stdio for the capture fixture. `bun mcp/server.ts github` serves the github tools.
const name = process.argv[2] ?? "demo";

const input = (properties: Record<string, string>) => ({
  type: "object",
  properties: Object.fromEntries(
    Object.entries(properties).map(([key, description]) => [key, { type: "string", description }]),
  ),
  required: Object.keys(properties),
});

const TOOLS: Record<string, { name: string; description: string; inputSchema: unknown }[]> = {
  github: [
    {
      name: "create_issue",
      description: "Open an issue in a repository.",
      inputSchema: input({ repo: "owner/name", title: "Issue title", body: "Markdown body" }),
    },
    {
      name: "list_pulls",
      description: "List open pull requests of a repository.",
      inputSchema: input({ repo: "owner/name" }),
    },
  ],
  jira: [
    { name: "search_issues", description: "Search Jira issues with JQL.", inputSchema: input({ jql: "JQL query" }) },
  ],
};

const INSTRUCTIONS: Record<string, string> = {
  github: "Use the github tools for issues and pull requests of the payments repositories.",
  jira: "Use the jira tools to look up tickets of the PAY project.",
};

const answer = (id: unknown, result: unknown) =>
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);

const handle = (message: { id?: unknown; method?: string; params?: { protocolVersion?: string; name?: string } }) => {
  if (message.id === undefined) return;
  if (message.method === "initialize") {
    answer(message.id, {
      protocolVersion: message.params?.protocolVersion ?? "2025-06-18",
      capabilities: { tools: {} },
      serverInfo: { name, version: "1.0.0" },
      instructions: INSTRUCTIONS[name],
    });
  } else if (message.method === "tools/list") {
    answer(message.id, { tools: TOOLS[name] ?? [] });
  } else if (message.method === "tools/call") {
    answer(message.id, { content: [{ type: "text", text: `${name}: ${message.params?.name} done` }] });
  } else {
    answer(message.id, {});
  }
};

let rest = "";
for await (const chunk of Bun.stdin.stream()) {
  rest += new TextDecoder().decode(chunk);
  let end = rest.indexOf("\n");
  while (end !== -1) {
    const line = rest.slice(0, end).trim();
    rest = rest.slice(end + 1);
    if (line !== "") handle(JSON.parse(line));
    end = rest.indexOf("\n");
  }
}
