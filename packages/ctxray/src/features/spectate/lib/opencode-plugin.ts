import { mkdir, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { MARK } from "./hooks.ts";

// OpenCode keeps no system prompt in its database (ADR 0008). A plugin sees it on every request, through
// `experimental.chat.system.transform`, and hands it to `ctxray __spectate-hook`, which redacts it before it
// writes anything. The plugin changes nothing OpenCode sends. Title calls are left out.
export const pluginSource = (
  command: readonly string[],
) => `// Written by \`ctxray spectate install\`, removed by \`ctxray spectate uninstall\`. It hands ctxray the system
// prompt of each request on this machine and changes nothing OpenCode sends.
const COMMAND: string[] = ${JSON.stringify(command)};

export const CtxraySpectate = async () => ({
  "experimental.chat.system.transform": async (input: { sessionID?: string }, output: { system: string[] }) => {
    if (!input.sessionID || output.system[0]?.startsWith("You are a title generator")) return;
    try {
      const child = Bun.spawn(COMMAND, { stdin: "pipe", stdout: "ignore", stderr: "ignore" });
      child.stdin.write(JSON.stringify({ session_id: input.sessionID, system: output.system }));
      child.stdin.end();
    } catch {}
  },
});
`;

export type PluginChange = { file: string; changed: boolean; foreign?: boolean };

// A file of the same name that isn't ctxray's stays as it is.
const ours = async (file: string) => {
  const found = Bun.file(file);
  return (await found.exists()) ? (await found.text()).includes(MARK) : undefined;
};

export const installPlugin = async (file: string, command: readonly string[]): Promise<PluginChange> => {
  const source = pluginSource(command);
  if ((await ours(file)) === false) return { file, changed: false, foreign: true };
  if ((await Bun.file(file).exists()) && (await Bun.file(file).text()) === source) return { file, changed: false };
  await mkdir(dirname(file), { recursive: true });
  await Bun.write(file, source);
  return { file, changed: true };
};

export const uninstallPlugin = async (file: string): Promise<PluginChange> => {
  if ((await ours(file)) !== true) return { file, changed: false };
  await rm(file);
  return { file, changed: true };
};
