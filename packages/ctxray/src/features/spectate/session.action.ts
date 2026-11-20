import { homedir } from "node:os";
import { relative, resolve } from "node:path";
import { buildLoadout, CAPTURE_ADAPTERS, findRoot, openProject, STATIC_ADAPTERS } from "#entities/harness/index.ts";
import type { Component, HarnessId, LoadoutSnapshot } from "#shared/contract/index.ts";
import type { Env } from "#shared/infra/index.ts";
import { filledFromFiles } from "./lib/fill.ts";
import { type Found, findSession } from "./lib/find.ts";

export type SessionLoadout =
  | { found: false; id: string }
  | {
      found: true;
      id: string;
      harness: HarnessId;
      cwd: string | undefined;
      requests: number;
      loadout: LoadoutSnapshot | undefined;
      reported: number | undefined; // input tokens the provider counted for the latest request
      unseen: Component[]; // what the harness's record leaves out and ctxray doesn't count
      filled: Component[]; // what it leaves out and the project's files tell
    };

const FILLED: Component[] = ["rules", "skills"];

const loadoutOf = async ({ harness, cwd, recorded }: Found, own: readonly string[]) => {
  const latest = recorded.requests.at(-1);
  // The Code tab of the Claude app is Claude Code: the same transcript, the same request.
  const kind = harness === "claude-code-desktop" ? "claude-code" : harness;
  const statics = STATIC_ADAPTERS[kind];
  const capture = CAPTURE_ADAPTERS[kind];
  if (!latest || !cwd || !statics || !capture) return undefined;
  const found = await findRoot(cwd).catch(() => undefined);
  if (!found) return undefined;
  // The project's root as the harness spells it, so the paths in the request come out relative to it.
  const work = resolve(cwd, relative(found.dir, found.root));
  const inventory = await statics.discover(await openProject(found.root));
  const files = recorded.files
    .map((path) => relative(work, resolve(cwd, path)))
    .filter((path) => !path.startsWith(".."));
  const predicted = statics.resolve(inventory, { cwd: relative(found.root, found.dir), files });
  const sent = capture.segment(latest, work);
  const loadout = buildLoadout({
    harness: { name: kind, version: recorded.version ?? "", model: recorded.model ?? "" },
    segments: [...filledFromFiles(sent, recorded.unseen, inventory, predicted, work), ...sent], // the start files first
    inventory,
    predicted,
    servers: {},
    work,
    first: recorded.requests.length === 1,
    own,
  });
  return { ...loadout, mode: "observe" as const };
};

// The loadout of a session the user ran: its latest request, rebuilt from the harness's own record and cut into
// pieces the way a captured one is. `own` is where ctxray's plugin lives: the skills it loads don't count.
export const createSpectateSessionAction =
  (env: Env) =>
  async (id: string, own: readonly string[], harnesses?: readonly HarnessId[]): Promise<SessionLoadout> => {
    const found = await findSession(id, env, env["HOME"] || homedir(), harnesses);
    if (!found) return { found: false, id };
    const { recorded } = found;
    return {
      found: true,
      id: found.id,
      harness: found.harness,
      cwd: found.cwd,
      requests: recorded.requests.length,
      loadout: await loadoutOf(found, own),
      reported: recorded.reported,
      unseen: recorded.unseen.filter((component) => !FILLED.includes(component)),
      filled: recorded.unseen.filter((component) => FILLED.includes(component)),
    };
  };
createSpectateSessionAction.inject = ["env"] as const;
export type SpectateSessionAction = ReturnType<typeof createSpectateSessionAction>;
