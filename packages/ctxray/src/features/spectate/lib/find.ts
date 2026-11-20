import { join } from "node:path";
import { filesOfRequest, type Recorded, readTranscript } from "#entities/harness/index.ts";
import type { HarnessId } from "#shared/contract/index.ts";
import type { Env } from "#shared/infra/index.ts";
import { spectateDir } from "./places.ts";
import { readSessions } from "./sessions.ts";
import { readStored } from "./stores.ts";

export type Found = { harness: HarnessId; id: string; cwd: string | undefined; recorded: Recorded };

// A Claude Code session the hooks never saw still has its transcript under Claude Code's projects folder.
const transcriptOf = async (id: string, env: Env, home: string) => {
  const config = env["CLAUDE_CONFIG_DIR"] || join(home, ".claude");
  try {
    for await (const path of new Bun.Glob(`projects/*/${id}.jsonl`).scan({ cwd: config, absolute: true })) return path;
  } catch {} // no Claude Code on this machine
  return undefined;
};

const claude = async (id: string, env: Env, home: string): Promise<Found | undefined> => {
  const sessions = await readSessions(spectateDir(env, process.platform, home));
  const known = sessions.find((one) => one.family === "claude" && one.id === id);
  const path = known?.transcript ?? (await transcriptOf(id, env, home));
  const file = path ? Bun.file(path) : undefined;
  if (!file || !(await file.exists())) return undefined;
  const { requests, version, cwd } = readTranscript(await file.text(), id);
  const latest = requests.at(-1);
  const recorded: Recorded = {
    requests,
    version,
    cwd,
    model: latest ? String(latest.body["model"]) : undefined,
    files: latest ? filesOfRequest(latest) : [],
    reported: undefined,
    unseen: [],
  };
  return { harness: known?.harness ?? "claude-code", id, cwd: known?.cwd ?? cwd, recorded };
};

// The session by its id, or by the start of it, from Claude Code's transcripts or another harness's own record.
export const findSession = async (
  id: string,
  env: Env,
  home: string,
  harnesses?: readonly HarnessId[],
): Promise<Found | undefined> => {
  const asked = (harness: HarnessId) => !harnesses || harnesses.includes(harness);
  if (asked("claude-code") || asked("claude-code-desktop")) {
    const found = await claude(id, env, home);
    if (found) return found;
  }
  const stored = (await readStored(env, home)).filter((one) => asked(one.harness));
  const match = stored.find((one) => one.id === id) ?? stored.find((one) => one.id.startsWith(id));
  if (!match) return undefined;
  const recorded = await match.read();
  return { harness: match.harness, id: match.id, cwd: recorded.cwd ?? match.cwd, recorded };
};
