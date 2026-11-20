import type { CommandSpec, Handler } from "#shared/cli/index.ts";
import { ExitCode } from "#shared/contract/index.ts";
import type { Translate } from "#shared/i18n/index.ts";
import { columns, type Renderer, span, type View } from "#shared/render/index.ts";
import { respond } from "../lib/protocol.ts";
import type { McpCallAction } from "../serve.action.ts";

export const mcpSpec: CommandSpec = {
  name: "mcp",
  summary: "command.mcp",
  options: { harness: { type: "string", summary: "option.mcpHarness", value: "ids" } },
};

// `ctxray mcp`: an MCP server on stdin and stdout, one JSON message per line, until the client hangs up. Only
// protocol messages reach stdout.
// A person who runs it in a terminal gets the line that connects it to their agent instead of a silent wait.
const SETUP: [string, string][] = [
  ["Claude Code", "claude mcp add ctxray -- ctxray mcp"],
  ["Codex", "codex mcp add ctxray -- ctxray mcp"],
  ["Gemini CLI", "gemini mcp add ctxray ctxray mcp"],
  ["OpenCode", 'opencode.json: "mcp": { "ctxray": { "type": "local", "command": ["ctxray", "mcp"] } }'],
  ["Cursor", '.cursor/mcp.json: "mcpServers": { "ctxray": { "command": "ctxray", "args": ["mcp"] } }'],
];

const setupView = (t: Translate): View => [
  [span(` ${t("mcp.setup")}`)],
  [],
  ...columns(SETUP.map(([agent, line]) => [span(`   ${agent}`, "strong"), span(line, "accent")])),
  [],
  [span(` ${t("mcp.setupNext")}`, "muted")],
];

export const createMcpCommand =
  (call: McpCallAction, version: string, t: Translate, renderer: Renderer): Handler =>
  async (values) => {
    if (process.stdin.isTTY) {
      renderer.print(setupView(t));
      return ExitCode.ok;
    }
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
createMcpCommand.inject = ["mcpCallAction", "version", "t", "renderer"] as const;
