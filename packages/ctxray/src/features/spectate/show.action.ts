import { homedir } from "node:os";
import { isAbsolute, relative } from "node:path";
import { findRoot, openProject, STATIC_ADAPTERS } from "#entities/harness/index.ts";
import type { HarnessId, RuleEntry } from "#shared/contract/index.ts";
import type { Env } from "#shared/infra/index.ts";
import { countTokens } from "#shared/tokens/index.ts";
import { spectateDir } from "./lib/places.ts";
import { readSessions, type Session } from "./lib/sessions.ts";
import { readStored, type Stored } from "./lib/stores.ts";

export type ShownSession = Session & {
  tokens: Record<string, number>; // what each loaded file costs now, by its path
  resolved: RuleEntry[] | undefined; // Cursor: what L3 predicts for the files the agent read
};

const shown = (path: string, cwd: string | undefined) => {
  if (!cwd || !isAbsolute(path)) return path;
  const inside = relative(cwd, path);
  return inside.startsWith("..") ? path : inside;
};

const tokensOf = async (paths: readonly string[]) => {
  const tokens: Record<string, number> = {};
  for (const path of paths) {
    const file = Bun.file(path);
    if (await file.exists()) tokens[path] = countTokens(await file.text());
  }
  return tokens;
};

// Cursor's hooks name the files the agent read, not the rules it got: L3 says what they bring in, from the
// project as it is now. A session whose folder is gone gets none.
const resolvedFor = async (session: Session): Promise<RuleEntry[] | undefined> => {
  const adapter = STATIC_ADAPTERS[session.harness];
  if (session.family !== "cursor" || !adapter || !session.cwd) return undefined;
  const found = await findRoot(session.cwd).catch(() => undefined);
  if (!found) return undefined;
  const project = await openProject(found.root);
  const cwd = relative(found.root, found.dir);
  const files = session.read.map((path) => relative(found.root, path)).filter((path) => !path.startsWith(".."));
  return adapter.resolve(await adapter.discover(project), { cwd, files }).rules;
};

// A session from a harness's own record, told in the words of one the hooks saw.
const fromRecord = async (stored: Stored): Promise<Session> => {
  const recorded = await stored.read();
  return {
    family: undefined,
    harness: stored.harness,
    id: stored.id,
    started: stored.started,
    last: stored.last,
    cwd: recorded.cwd ?? stored.cwd,
    transcript: undefined,
    model: recorded.model,
    version: recorded.version,
    entrypoint: undefined,
    prompts: 0,
    loaded: [],
    read: [],
    requests: recorded.requests.length,
  };
};

// `ctxray spectate`: the latest sessions, with what each loaded. Claude Code and Cursor through the hooks' log,
// the other harnesses from their own records.
export const createSpectateShowAction =
  (env: Env) => async (options: { last: number; harnesses?: readonly HarnessId[] }) => {
    const home = env["HOME"] || homedir();
    const dir = spectateDir(env, process.platform, home);
    const asked = (harness: HarnessId) => !options.harnesses || options.harnesses.includes(harness);
    const hooked = (await readSessions(dir)).filter((session) => asked(session.harness));
    const stored = (await readStored(env, home)).filter((one) => asked(one.harness));
    const latest = [...hooked, ...stored].sort((a, b) => b.last - a.last).slice(0, options.last);
    const sessions = await Promise.all(latest.map((one) => ("family" in one ? one : fromRecord(one))));
    const result: ShownSession[] = [];
    for (const session of sessions) {
      const tokens = await tokensOf(session.loaded.map((one) => one.path));
      const loaded = session.loaded.map((one) => ({
        ...one,
        path: shown(one.path, session.cwd),
        ...(one.trigger && { trigger: shown(one.trigger, session.cwd) }),
        ...(one.parent && { parent: shown(one.parent, session.cwd) }),
      }));
      const byShown = Object.fromEntries(
        Object.entries(tokens).map(([path, count]) => [shown(path, session.cwd), count]),
      );
      result.push({
        ...session,
        loaded,
        read: session.read.map((path) => shown(path, session.cwd)),
        tokens: byShown,
        resolved: await resolvedFor(session),
      });
    }
    return { dir, sessions: result };
  };
createSpectateShowAction.inject = ["env"] as const;
export type SpectateShowAction = ReturnType<typeof createSpectateShowAction>;
