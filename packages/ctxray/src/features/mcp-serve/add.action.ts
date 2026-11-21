import { homedir } from "node:os";
import { findRoot } from "#entities/harness/index.ts";
import type { HarnessId } from "#shared/contract/index.ts";
import type { Env } from "#shared/infra/index.ts";
import { addCtxray, hasCtxray } from "./lib/config-file.ts";
import { projectTarget, type Target, userCommand, userTarget } from "./lib/targets.ts";

export type McpAddOutcome =
  | { kind: "already" | "written"; target: Target }
  | { kind: "comments"; target: Target }
  | { kind: "ran"; command: string }
  | { kind: "noBinary"; binary: string }
  | { kind: "failed"; command: string; output: string };

// `ctxray mcp add codex`: connects ctxray to an agent once. Claude Code, Codex, and Gemini CLI add it to the
// user's config through their own `mcp add`, ctxray writes the rest itself, and every `--project` file. A second
// call finds ctxray in the config and changes nothing.
export const createMcpAddAction =
  (env: Env, cwd: string) =>
  async (agent: HarnessId, project: boolean): Promise<McpAddOutcome> => {
    const home = env["HOME"] || env["USERPROFILE"] || homedir();
    const target = project
      ? await projectTarget(agent, (await findRoot(cwd)).root)
      : await userTarget(agent, home, env);
    if (await hasCtxray(target)) return { kind: "already", target };
    const own = project ? undefined : userCommand(agent);
    if (!own) return { kind: await addCtxray(target), target };
    const binary = Bun.which(own.binary, { PATH: env["PATH"] ?? "" });
    if (binary === null) return { kind: "noBinary", binary: own.binary };
    const command = [own.binary, ...own.args].join(" ");
    const child = Bun.spawn([binary, ...own.args], { cwd, env: { ...env }, stdout: "pipe", stderr: "pipe" });
    const [out, err, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return code === 0 ? { kind: "ran", command } : { kind: "failed", command, output: `${out}${err}`.trim() };
  };
createMcpAddAction.inject = ["env", "cwd"] as const;
export type McpAddAction = ReturnType<typeof createMcpAddAction>;
