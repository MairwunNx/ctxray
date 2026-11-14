#!/usr/bin/env bun
import { ExitCode } from "#shared/contract/index.ts";
import { runMcpShim } from "#shared/mcp-shim/index.ts";
import { runCli } from "./cli.ts";
import { createContainer } from "./container.ts";
import { registerUserModules } from "./user-modules.ts";

// Ctrl-C ends the run with 130, as shells expect. Ink puts the terminal back on the way out.
process.on("SIGINT", () => process.exit(ExitCode.interrupted));

// A harness launched by ctxray starts its MCP servers through ctxray itself (see shared/mcp-shim).
if (process.argv[2] === "__mcp-shim") process.exit(await runMcpShim(process.argv.slice(3)));

registerUserModules();
const container = createContainer(process.env, process.cwd());
const code = await runCli(
  process.argv.slice(2),
  {
    env: process.env,
    stdout: process.stdout,
    stderr: process.stderr,
    intlLocale: Intl.DateTimeFormat().resolvedOptions().locale,
  },
  container,
);
await container.dispose();
// An explicit exit skips the 30 ms Bun idles after Ink unmounts.
process.exit(code);
