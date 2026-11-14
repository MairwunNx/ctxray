import { Writable } from "node:stream";
import { runCli } from "./cli.ts";
import { createContainer } from "./container.ts";

// Runs the CLI in `cwd` against a piped stdout, so it renders plain text.
export const runIn = async (cwd: string, args: string[], env: Record<string, string> = {}) => {
  let stdout = "";
  let stderr = "";
  const out = new Writable({
    write: (chunk, _, done) => {
      stdout += chunk;
      done();
    },
  }) as NodeJS.WriteStream;
  const code = await runCli(
    args,
    { env, stdout: out, stderr: { write: (text) => (stderr += text) } },
    createContainer(env, cwd),
  );
  return { code, stdout, stderr };
};
