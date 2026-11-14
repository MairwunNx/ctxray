import { appendFileSync } from "node:fs";
import { createRedactor } from "#shared/redact/index.ts";

// What the launcher hands the shim in a file: the shim's own command line stays short and free of secrets.
export type ShimConfig = {
  log: string; // JSONL, one MCP message per line, redacted
  env: Record<string, string>; // set for the server, like the user's own proxy
  unset: string[]; // removed for the server, like the egress guard the harness runs behind
  patterns: { source: string; flags: string }[]; // the config's redaction patterns
};

export type ShimLine = { at: number; from: "client" | "server"; message: unknown };

// Calls `onLine` with each complete line of a byte stream.
const lines = (onLine: (line: string) => void) => {
  const decoder = new TextDecoder();
  let rest = "";
  return (chunk: Uint8Array) => {
    rest += decoder.decode(chunk, { stream: true });
    let end = rest.indexOf("\n");
    while (end !== -1) {
      const line = rest.slice(0, end).trim();
      rest = rest.slice(end + 1);
      if (line !== "") onLine(line);
      end = rest.indexOf("\n");
    }
  };
};

// Runs an MCP server over stdio and passes every byte through unchanged, while it writes each JSON-RPC
// message to the log: `initialize`, `tools/list`, `tools/call` and their answers show what the harness got.
export const runMcpShim = async (args: readonly string[]): Promise<number> => {
  const split = args.indexOf("--");
  const [configFile] = args;
  const command = args.slice(split + 1);
  if (split === -1 || configFile === undefined || command.length === 0) {
    process.stderr.write("usage: ctxray __mcp-shim <config.json> -- <command> [args...]\n");
    return 2;
  }
  const config = (await Bun.file(configFile).json()) as ShimConfig;
  const redactor = createRedactor(config.patterns.map(({ source, flags }) => new RegExp(source, flags)));
  const log = (from: ShimLine["from"]) =>
    lines((line) => {
      let message: unknown;
      try {
        message = JSON.parse(line);
      } catch {
        message = { unparsed: line };
      }
      const entry: ShimLine = { at: Date.now(), from, message: redactor.value(message) };
      appendFileSync(config.log, `${JSON.stringify(entry)}\n`);
    });

  const env: Record<string, string | undefined> = { ...process.env, ...config.env };
  for (const name of config.unset) delete env[name];
  const server = Bun.spawn([...command], { env, stdin: "pipe", stdout: "pipe", stderr: "inherit" });
  for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"] as const) process.on(signal, () => server.kill(signal));

  const fromClient = log("client");
  const pumpIn = (async () => {
    for await (const chunk of Bun.stdin.stream()) {
      fromClient(chunk);
      server.stdin.write(chunk);
      await server.stdin.flush();
    }
    await server.stdin.end();
  })();
  const fromServer = log("server");
  for await (const chunk of server.stdout) {
    fromServer(chunk);
    process.stdout.write(chunk);
  }
  const code = await server.exited;
  void pumpIn.catch(() => {});
  return code;
};
