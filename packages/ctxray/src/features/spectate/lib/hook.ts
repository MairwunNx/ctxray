import { appendFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createRedactor } from "#shared/redact/index.ts";
import { type Family, spectateDir } from "./places.ts";

// What a hook keeps of an event: who and where, which file loaded and why, which file the agent read. Never a
// prompt's text, only its length.
const KEEP = [
  "hook_event_name",
  "session_id",
  "conversation_id",
  "cwd",
  "transcript_path",
  "workspace_roots",
  "model",
  "source",
  "cursor_version",
  "file_path",
  "memory_type",
  "load_reason",
  "trigger_file_path",
  "parent_file_path",
];

export type SpectateLine = Record<string, unknown> & { at: number; family: Family };

// The line one event adds to the log. Claude Code tells its entry point only in the hook's environment.
export const lineOf = (family: Family, payload: Record<string, unknown>, env: Record<string, string | undefined>) => {
  const line: SpectateLine = { at: Date.now(), family };
  for (const key of KEEP) if (payload[key] !== undefined) line[key] = payload[key];
  if (typeof payload["prompt"] === "string") line["prompt_length"] = payload["prompt"].length;
  const entry = env["CLAUDE_CODE_ENTRYPOINT"];
  if (family === "claude" && entry) line["entrypoint"] = entry;
  return line;
};

// OpenCode's plugin sends the system prompt of a request: the latest one of each session is kept, redacted.
const keepSystem = async (dir: string, payload: Record<string, unknown>) => {
  const session = payload["session_id"];
  const system = payload["system"];
  if (typeof session !== "string" || !/^[\w-]+$/.test(session) || !Array.isArray(system)) return 0;
  const kept = createRedactor([]).value({ at: Date.now(), system: system.map(String) });
  await mkdir(join(dir, "opencode"), { recursive: true });
  await Bun.write(join(dir, "opencode", `${session}.json`), JSON.stringify(kept));
  return 0;
};

// `ctxray __spectate-hook <family> [dir]`: a harness runs it on every event it observes. It writes one line to
// ctxray's log, prints nothing, since Claude Code would put the output into the context, and never fails the
// harness: a broken payload is only skipped. The plugin's hooks name no folder: the log goes to ctxray's own.
export const runSpectateHook = async (
  args: readonly string[],
  input: string,
  env: Record<string, string | undefined>,
) => {
  const [family, given] = args;
  if (family !== "claude" && family !== "cursor" && family !== "opencode") return 0;
  const dir = given || spectateDir(env, process.platform, env["HOME"] || homedir());
  try {
    const payload = JSON.parse(input) as Record<string, unknown>;
    if (family === "opencode") return await keepSystem(dir, payload);
    const line = createRedactor([]).value(lineOf(family, payload, env));
    await mkdir(dir, { recursive: true });
    await appendFile(join(dir, `${family}.jsonl`), `${JSON.stringify(line)}\n`);
  } catch {}
  return 0;
};
