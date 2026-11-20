import { homedir } from "node:os";
import { join, relative, resolve } from "node:path";
import {
  buildLoadout,
  CAPTURE_ADAPTERS,
  filesOfRequest,
  findRoot,
  openProject,
  readTranscript,
  STATIC_ADAPTERS,
} from "#entities/harness/index.ts";
import type { LoadoutSnapshot } from "#shared/contract/index.ts";
import type { Env } from "#shared/infra/index.ts";

export type SessionLoadout =
  | { found: false; id: string }
  | { found: true; id: string; cwd: string | undefined; requests: number; loadout: LoadoutSnapshot | undefined };

// The session's transcript, under Claude Code's projects folder.
const transcriptOf = async (id: string, env: Env, home: string) => {
  const config = env["CLAUDE_CONFIG_DIR"] || join(home, ".claude");
  try {
    for await (const path of new Bun.Glob(`projects/*/${id}.jsonl`).scan({ cwd: config, absolute: true })) return path;
  } catch {} // no Claude Code on this machine
  return undefined;
};

// The loadout of a live Claude Code session for the plugin's `/ctxray`: its latest request, rebuilt from the
// transcript and cut into pieces the way a captured one is. `own` is where ctxray's plugin lives: the skills it
// loads don't count.
export const createSessionAction =
  (env: Env) =>
  async (id: string, own: readonly string[]): Promise<SessionLoadout> => {
    const path = await transcriptOf(id, env, env["HOME"] || homedir());
    if (!path) return { found: false, id };
    const { requests, version, cwd } = readTranscript(await Bun.file(path).text(), id);
    const latest = requests.at(-1);
    const statics = STATIC_ADAPTERS["claude-code"];
    const capture = CAPTURE_ADAPTERS["claude-code"];
    if (!latest || !cwd || !statics || !capture) return { found: true, id, cwd, requests: 0, loadout: undefined };
    const found = await findRoot(cwd).catch(() => undefined);
    if (!found) return { found: true, id, cwd, requests: requests.length, loadout: undefined };
    // The project's root as Claude Code spells it, so the paths in the request come out relative to it.
    const work = resolve(cwd, relative(found.dir, found.root));
    const inventory = await statics.discover(await openProject(found.root));
    const files = filesOfRequest(latest)
      .map((file) => relative(work, resolve(cwd, file)))
      .filter((file) => !file.startsWith(".."));
    const loadout = buildLoadout({
      harness: { name: "claude-code", version: version ?? "", model: String(latest.body["model"]) },
      segments: capture.segment(latest, work),
      inventory,
      predicted: statics.resolve(inventory, { cwd: relative(found.root, found.dir), files }),
      servers: {},
      work,
      first: requests.length === 1,
      own,
    });
    return { found: true, id, cwd, requests: requests.length, loadout: { ...loadout, mode: "observe" } };
  };
createSessionAction.inject = ["env"] as const;
export type SessionAction = ReturnType<typeof createSessionAction>;
