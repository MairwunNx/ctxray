import { Database } from "bun:sqlite";
import { stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { type HistoryRows, type Recorded, readChat, readHistory, readRollout } from "#entities/harness/index.ts";
import type { HarnessId } from "#shared/contract/index.ts";
import type { Env } from "#shared/infra/index.ts";
import { spectateDir } from "./places.ts";

// A session a harness keeps in its own folder, found without hooks: Codex's rollouts, Gemini CLI's chat files,
// OpenCode's database. ctxray only reads them, and opens the database read-only.
export type Stored = {
  harness: HarnessId;
  id: string;
  cwd: string | undefined;
  started: number;
  last: number;
  read: () => Promise<Recorded>;
};

type Places = { env: Env; home: string };

const glob = async (pattern: string, cwd: string) => {
  const found: string[] = [];
  try {
    for await (const path of new Bun.Glob(pattern).scan({ cwd, absolute: true })) found.push(path);
  } catch {}
  return found;
};

// The first line of a file, from its head: Gemini CLI's chat file starts with its session's id.
const firstLine = async (path: string) => {
  const head = await Bun.file(path)
    .slice(0, 1 << 16)
    .text();
  try {
    return JSON.parse(head.split("\n")[0] ?? "") as Record<string, unknown>;
  } catch {
    return {};
  }
};

const str = (value: unknown) => (typeof value === "string" && value !== "" ? value : undefined);
const time = (value: unknown, fallback: number) =>
  typeof value === "string" ? Date.parse(value) || fallback : fallback;

// `rollout-2026-11-20T14-29-50-<thread id>.jsonl`, the time in UTC: the name tells enough to list a session, so
// only the rollouts shown get read.
const ROLLOUT = /^rollout-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(.+)\.jsonl$/;

const codex = async ({ env, home }: Places): Promise<Stored[]> => {
  const dir = join(env["CODEX_HOME"] || join(home, ".codex"), "sessions");
  return Promise.all(
    (await glob("**/rollout-*.jsonl", dir)).map(async (path) => {
      const [, day, hour, minute, second, id = basename(path, ".jsonl")] = ROLLOUT.exec(basename(path)) ?? [];
      const last = (await stat(path)).mtimeMs;
      const started = day ? Date.parse(`${day}T${hour}:${minute}:${second}Z`) : last;
      const read = async () => readRollout(await Bun.file(path).text(), id);
      return { harness: "codex" as const, id, cwd: undefined, started, last, read };
    }),
  );
};

// A project's folder under `tmp/` keeps the path it stands for in `.project_root`.
const gemini = async ({ env, home }: Places): Promise<Stored[]> => {
  const dir = join(env["GEMINI_CLI_HOME"] || home, ".gemini", "tmp");
  return Promise.all(
    (await glob("*/chats/session-*.jsonl", dir)).map(async (path) => {
      const meta = await firstLine(path);
      const root = Bun.file(join(dirname(dirname(path)), ".project_root"));
      const cwd = (await root.exists()) ? (await root.text()).trim() : undefined;
      const last = (await stat(path)).mtimeMs;
      const id = str(meta["sessionId"]) ?? basename(path, ".jsonl");
      const read = async () => ({ ...readChat(await Bun.file(path).text(), id), cwd });
      return { harness: "gemini-cli" as const, id, cwd, started: time(meta["startTime"], last), last, read };
    }),
  );
};

type SessionRow = {
  id: string;
  directory: string;
  version: string;
  model: string | null;
  created: number;
  updated: number;
};

// The system prompt ctxray's OpenCode plugin kept for the session's latest request, if it was installed.
const systemOf = async (env: Env, home: string, session: string) => {
  const file = Bun.file(join(spectateDir(env, process.platform, home), "opencode", `${session}.json`));
  if (!(await file.exists())) return undefined;
  const kept = (await file.json().catch(() => ({}))) as { system?: unknown };
  return Array.isArray(kept.system) ? kept.system.map(String) : undefined;
};

// Subagents' sessions have a parent: they show under the session that started them, not on their own.
const opencode = async ({ env, home }: Places): Promise<Stored[]> => {
  const path = join(env["XDG_DATA_HOME"] || join(home, ".local", "share"), "opencode", "opencode.db");
  if (!(await Bun.file(path).exists())) return [];
  const query = <T>(sql: string, ...params: string[]) => {
    const db = new Database(path, { readonly: true });
    try {
      return db.query(sql).all(...params) as T[];
    } finally {
      db.close();
    }
  };
  try {
    const rows = query<SessionRow>(
      "select id, directory, version, model, time_created as created, time_updated as updated from session where parent_id is null",
    );
    return rows.map((row) => ({
      harness: "opencode" as const,
      id: row.id,
      cwd: row.directory,
      started: row.created,
      last: row.updated,
      read: async () => {
        const history: HistoryRows = {
          session: row,
          messages: query("select id, data from message where session_id = ? order by time_created, id", row.id),
          parts: query("select message_id, data from part where session_id = ? order by time_created, id", row.id),
        };
        return readHistory(history, row.id, await systemOf(env, home, row.id));
      },
    }));
  } catch {
    return [];
  }
};

export const STORES: Record<string, (places: Places) => Promise<Stored[]>> = {
  codex,
  "gemini-cli": gemini,
  opencode,
};

// Every stored session of these harnesses, the most recent first.
export const readStored = async (
  env: Env,
  home: string,
  harnesses: readonly HarnessId[] = Object.keys(STORES) as HarnessId[],
) => {
  const found = await Promise.all(harnesses.flatMap((harness) => STORES[harness]?.({ env, home }) ?? []));
  return found.flat().sort((a, b) => b.last - a.last);
};
