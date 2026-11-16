import type { Env } from "#shared/infra/index.ts";
import { argsOf } from "./lib/tools.ts";

// What an agent reads at most from one call: a long test run stays useful without flooding its context.
const LIMIT = 40_000;

// A tool call runs ctxray itself in the project, without colour, and hands back what it printed. The exit code
// of a failed test or a broken config says the call went wrong.
export const createMcpCallAction =
  (self: readonly string[], env: Env, cwd: string) =>
  async (name: string, input: Record<string, unknown>, harness: string | undefined) => {
    const args = argsOf(name, input, harness);
    if (!args) return undefined;
    const proc = Bun.spawn([...self, ...args], {
      cwd: env["CLAUDE_PROJECT_DIR"] || cwd,
      env: { ...env, NO_COLOR: "1", FORCE_COLOR: "0" },
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    const [out, err, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    const text = [out.trim(), err.trim()].filter(Boolean).join("\n\n");
    const cut = text.length > LIMIT ? `${text.slice(0, LIMIT)}\n…` : text;
    return { text: `$ ctxray ${args.join(" ")}\n\n${cut}`.trim(), isError: code !== 0 };
  };
createMcpCallAction.inject = ["self", "env", "cwd"] as const;
export type McpCallAction = ReturnType<typeof createMcpCallAction>;
