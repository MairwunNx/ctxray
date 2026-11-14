#!/usr/bin/env bun
import { ExitCode } from "../shared/contract/index.ts";
import { runCli } from "./cli.ts";
import { createContainer } from "./container.ts";
import { registerUserModules } from "./user-modules.ts";

// Ctrl-C ends the run with 130, as shells expect. Ink puts the terminal back on the way out.
process.on("SIGINT", () => process.exit(ExitCode.interrupted));

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
