import { join } from "node:path";
import type { HarnessId } from "#shared/contract/index.ts";
import type { SpectateLine } from "./hook.ts";
import type { Family } from "./places.ts";

// A file the harness said it loaded: Claude Code's InstructionsLoaded.
export type Loaded = { path: string; reason: string; trigger?: string; parent?: string };

// One session as the hooks saw it, newest event last.
export type Session = {
  family: Family;
  harness: HarnessId;
  id: string;
  started: number;
  last: number;
  cwd: string | undefined;
  model: string | undefined;
  version: string | undefined; // Cursor's, from its payloads
  entrypoint: string | undefined; // Claude Code's, from the hook's environment
  prompts: number;
  loaded: Loaded[];
  read: string[]; // files the agent read, from Cursor's beforeReadFile
};

const text = (value: unknown) => (typeof value === "string" && value !== "" ? value : undefined);

// The Claude app drives its Code tab through the TypeScript Agent SDK (ADR 0011), the CLI says `cli`, and
// `sdk-cli` with -p. Cursor CLI versions are dates, the editor's are semver (ADR 0009, 0010).
const DESKTOP = ["claude-desktop", "sdk-ts", "local-agent"];

const harnessOf = (family: Family, line: SpectateLine): HarnessId => {
  if (family === "claude")
    return DESKTOP.includes(text(line["entrypoint"]) ?? "") ? "claude-code-desktop" : "claude-code";
  return /^\d{4}\.\d{2}\.\d{2}/.test(text(line["cursor_version"]) ?? "") ? "cursor-cli" : "cursor-ide";
};

const linesOf = async (dir: string, family: Family): Promise<SpectateLine[]> => {
  const file = Bun.file(join(dir, `${family}.jsonl`));
  if (!(await file.exists())) return [];
  return (await file.text()).split("\n").flatMap((raw) => {
    try {
      return raw.trim() === "" ? [] : [JSON.parse(raw) as SpectateLine];
    } catch {
      return [];
    }
  });
};

const add = (session: Session, line: SpectateLine) => {
  session.last = Math.max(session.last, line.at);
  session.cwd ??=
    text(line["cwd"]) ?? (Array.isArray(line["workspace_roots"]) ? text(line["workspace_roots"][0]) : undefined);
  session.model ??= text(line["model"]);
  session.version ??= text(line["cursor_version"]);
  session.entrypoint ??= text(line["entrypoint"]);
  const event = text(line["hook_event_name"]);
  const path = text(line["file_path"]);
  if (event === "UserPromptSubmit" || event === "beforeSubmitPrompt") session.prompts++;
  if (event === "InstructionsLoaded" && path && !session.loaded.some((one) => one.path === path)) {
    const trigger = text(line["trigger_file_path"]);
    const parent = text(line["parent_file_path"]);
    session.loaded.push({
      path,
      reason: text(line["load_reason"]) ?? "",
      ...(trigger && { trigger }),
      ...(parent && { parent }),
    });
  }
  if (event === "beforeReadFile" && path && !session.read.includes(path)) session.read.push(path);
};

// Every session in ctxray's log, the most recent first.
export const readSessions = async (dir: string): Promise<Session[]> => {
  const sessions = new Map<string, Session>();
  for (const family of ["claude", "cursor"] as const) {
    for (const line of await linesOf(dir, family)) {
      const id = text(line["session_id"]) ?? text(line["conversation_id"]);
      if (!id) continue;
      const known =
        sessions.get(`${family}:${id}`) ??
        ({
          family,
          harness: harnessOf(family, line),
          id,
          started: line.at,
          last: line.at,
          cwd: undefined,
          model: undefined,
          version: undefined,
          entrypoint: undefined,
          prompts: 0,
          loaded: [],
          read: [],
        } satisfies Session);
      add(known, line);
      sessions.set(`${family}:${id}`, known);
    }
  }
  return [...sessions.values()].sort((a, b) => b.last - a.last);
};
