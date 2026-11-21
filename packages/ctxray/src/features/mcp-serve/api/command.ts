import { homedir } from "node:os";
import type { CommandSpec, Handler } from "#shared/cli/index.ts";
import { ExitCode, HarnessId } from "#shared/contract/index.ts";
import type { Translate } from "#shared/i18n/index.ts";
import type { Env } from "#shared/infra/index.ts";
import { type Renderer, span } from "#shared/render/index.ts";
import type { McpAddAction } from "../add.action.ts";
import { respond } from "../lib/protocol.ts";
import type { McpCallAction } from "../serve.action.ts";
import { AGENTS, addView, setupView } from "./add-view.ts";

export const mcpSpec: CommandSpec = {
  name: "mcp",
  summary: "command.mcp",
  subcommands: { serve: "mcp.serve", add: "mcp.add" },
  defaultSubcommand: "serve",
  options: {
    harness: { type: "string", summary: "option.mcpHarness", value: "ids" },
    project: { type: "boolean", summary: "option.mcpProject" },
  },
};

// `ctxray mcp`: an MCP server on stdin and stdout, one JSON message per line, until the client hangs up. Only
// protocol messages reach stdout.
export const createMcpCommand =
  (
    call: McpCallAction,
    add: McpAddAction,
    version: string,
    t: Translate,
    renderer: Renderer,
    env: Env,
    cwd: string,
  ): Handler =>
  async (values, [sub, agent]) => {
    if (sub === "add") {
      const parsed = HarnessId.safeParse(agent);
      if (!parsed.success || !AGENTS.includes(parsed.data)) {
        renderer.print([[span(t("mcp.addWhat", { agents: AGENTS.join(", ") }), "failure")]]);
        return ExitCode.usage;
      }
      const outcome = await add(parsed.data, values["project"] === true);
      const home = env["HOME"] || env["USERPROFILE"] || homedir();
      renderer.print(addView(parsed.data, outcome, t, home, cwd));
      const failed = outcome.kind === "noBinary" || outcome.kind === "failed" || outcome.kind === "comments";
      return failed ? ExitCode.environment : ExitCode.ok;
    }
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
createMcpCommand.inject = ["mcpCallAction", "mcpAddAction", "version", "t", "renderer", "env", "cwd"] as const;
