import { appendFileSync } from "node:fs";
import { join } from "node:path";
import type { ShimConfig, ShimLine } from "#shared/mcp-shim/index.ts";
import { createRedactor } from "#shared/redact/index.ts";
import type { RunDirs } from "./isolate.ts";

// An HTTP MCP server behind the proxy: the harness talks to `url`, ctxray hears every message.
export type RemoteMcp = (
  target: string,
  onMessage: (line: Omit<ShimLine, "at">) => void,
) => { url: string; close: () => void };

export type McpRouting = { self: readonly string[]; shimEnv: Pick<ShimConfig, "env" | "unset" | "patterns"> };

// Puts every MCP server of a run behind ctxray: stdio ones behind the shim, HTTP ones behind the proxy. Both
// write the same log, `<logs>/<server>.jsonl`, so one reader serves both.
export const routeMcp = (dirs: RunDirs, { self, shimEnv }: McpRouting, remoteMcp: RemoteMcp) => {
  const redactor = createRedactor(shimEnv.patterns.map(({ source, flags }) => new RegExp(source, flags)));
  const closers: (() => void)[] = [];
  const shim = async (name: string, command: readonly string[]) => {
    const config = join(dirs.logs, `${name}.shim.json`);
    await Bun.write(config, JSON.stringify({ ...shimEnv, log: join(dirs.logs, `${name}.jsonl`) }));
    return [...self, "__mcp-shim", config, "--", ...command];
  };
  const remote = (name: string, url: string) => {
    const opened = remoteMcp(url, ({ from, message }) => {
      const line: ShimLine = { at: Date.now(), from, message: redactor.value(message) };
      appendFileSync(join(dirs.logs, `${name}.jsonl`), `${JSON.stringify(line)}\n`);
    });
    closers.push(opened.close);
    return opened.url;
  };
  const close = () => {
    for (const closer of closers) closer();
  };
  return { shim, remote, close };
};
