import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";
import type { LoadoutPieces } from "#shared/contract/index.ts";
import type { StaticLoadout } from "./static-loadout.ts";

export class UnknownRevision extends Error {}

export type Revision = { dir: string; commit: string; remove: () => Promise<void> };

// The project as another revision holds it, in a folder of its own: `git archive` reads the object store and
// never touches the working tree or the index.
export const checkoutRevision = async (root: string, ref: string): Promise<Revision> => {
  const resolved = await $`git -C ${root} rev-parse --verify --quiet ${`${ref}^{commit}`}`.quiet().nothrow();
  if (resolved.exitCode !== 0) throw new UnknownRevision(ref);
  const commit = resolved.stdout.toString().trim();
  const dir = await realpath(await mkdtemp(join(tmpdir(), "ctxray-base-")));
  const archive = await $`git -C ${root} archive --format=tar ${commit} | tar -x -C ${dir}`.quiet().nothrow();
  if (archive.exitCode !== 0) {
    await rm(dir, { recursive: true, force: true });
    throw new UnknownRevision(ref);
  }
  // A project without a .git of its own has no ignore rules to read: the copy gets an empty repository.
  await $`git -C ${dir} init -q`.quiet().nothrow();
  return { dir, commit, remove: () => rm(dir, { recursive: true, force: true }) };
};

// What L3 predicts, as the pieces a diff compares. Without a run, only files count: rules, skills, commands.
export const staticPieces = (loadout: StaticLoadout): LoadoutPieces => ({
  total: Object.values(loadout.tokens.byComponent).reduce((sum, tokens) => sum + tokens, 0),
  byComponent: loadout.tokens.byComponent,
  items: {
    system: [],
    tools: [],
    rules: loadout.rules.map((rule) => ({ id: rule.path, tokens: rule.tokens })),
    skills: loadout.skills.listed.map((skill) => ({ id: skill.name, tokens: skill.tokens })),
    mcp: loadout.mcp.servers.map((server) => ({ id: server.name, tokens: 0 })),
    commands: loadout.commands.map((command) => ({ id: command.name, tokens: 0 })),
  },
});
