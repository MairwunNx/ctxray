import type { CommandSpec, Handler } from "#shared/cli/index.ts";
import { ExitCode } from "#shared/contract/index.ts";
import { respond } from "../lib/protocol.ts";
import type { McpCallAction } from "../serve.action.ts";

export const mcpSpec: CommandSpec = {
  name: "mcp",
  summary: "command.mcp",
  options: { harness: { type: "string", summary: "option.mcpHarness", value: "ids" } },
};

// `ctxray mcp`: an MCP server on stdin and stdout, one JSON message per line, until the client hangs up. Only
// protocol messages reach stdout.
export const createMcpCommand =
  (call: McpCallAction, version: string): Handler =>
  async (values) => {
    const harness = typeof values["harness"] === "string" ? values["harness"] : undefined;
    const server = { version, call: (name: string, input: Record<string, unknown>) => call(name, input, harness) };
    const decoder = new TextDecoder();
    let buffer = "";
    const handle = async (line: string) => {
      let message: unknown;
      try {
        message = JSON.parse(line);
      } catch {
        return;
      }
      const answer = await respond(message as Parameters<typeof respond>[0], server);
      if (answer) process.stdout.write(`${JSON.stringify(answer)}\n`);
    };
    for await (const chunk of Bun.stdin.stream()) {
      buffer += decoder.decode(chunk, { stream: true });
      for (let end = buffer.indexOf("\n"); end >= 0; end = buffer.indexOf("\n")) {
        const line = buffer.slice(0, end).trim();
        buffer = buffer.slice(end + 1);
        if (line !== "") await handle(line);
      }
    }
    return ExitCode.ok;
  };
createMcpCommand.inject = ["mcpCallAction", "version"] as const;
