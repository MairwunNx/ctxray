import { homedir } from "node:os";
import { isAbsolute, relative } from "node:path";
import { findRoot, openProject, STATIC_ADAPTERS } from "#entities/harness/index.ts";
import type { HarnessId, RuleEntry } from "#shared/contract/index.ts";
import type { Env } from "#shared/infra/index.ts";
import { countTokens } from "#shared/tokens/index.ts";
import { spectateDir } from "./lib/places.ts";
import { readSessions, type Session } from "./lib/sessions.ts";

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

// `ctxray spectate`: the latest sessions the hooks saw, with what each loaded.
export const createSpectateShowAction =
  (env: Env) => async (options: { last: number; harnesses?: readonly HarnessId[] }) => {
    const dir = spectateDir(env, process.platform, env["HOME"] || homedir());
    const sessions = (await readSessions(dir))
      .filter((session) => !options.harnesses || options.harnesses.includes(session.harness))
      .slice(0, options.last);
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
