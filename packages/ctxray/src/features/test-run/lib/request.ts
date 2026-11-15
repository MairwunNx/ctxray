import { buildLoadout, STATIC_ADAPTERS } from "#entities/harness/index.ts";
import type { Exchange, LoadoutSnapshot } from "#shared/contract/index.ts";
import type { OpenSession } from "./capture.ts";
import { type CapturedLoadout, type CapturedRequest, toCaptured } from "./captured.ts";
import { fail } from "./failure.ts";
import type { CellScope } from "./scope.ts";

export type RequestContext = {
  cwd: string;
  files: readonly string[]; // read so far: L3 predicts for them
  before: LoadoutSnapshot | undefined; // the request before, for what this one added
};

// One request the harness sent, as a test sees it: what reached the model, what it added, what L3 predicts.
export const requestOf = async (
  scope: CellScope,
  session: OpenSession,
  raw: Exchange,
  { cwd, files, before }: RequestContext,
): Promise<CapturedRequest> => {
  const resolve = STATIC_ADAPTERS[scope.harness]?.resolve;
  const predicted = resolve
    ? resolve(scope.inventory, { cwd, files: [...files] })
    : fail("resolve.noAdapter", { harness: scope.harness });
  const loadout = buildLoadout({
    harness: { name: scope.harness, version: session.harness.version, model: session.model },
    segments: session.adapter.segment(raw, session.harness.dirs.work),
    inventory: scope.inventory,
    predicted,
    servers: await session.harness.servers(),
    work: session.harness.dirs.work,
    first: raw.position === 0,
    aliases: session.harness.aliases,
  });
  const hadRules = new Set(before?.rules.map((rule) => rule.path));
  const hadSkills = new Set(before?.skills.loaded.map((skill) => skill.name));
  const view: CapturedLoadout = toCaptured(loadout);
  return {
    kind: "request",
    index: raw.position ?? 0,
    loadout: view,
    added: {
      rules: loadout.rules.map((rule) => rule.path).filter((path) => !hadRules.has(path)),
      skills: loadout.skills.loaded.map((skill) => skill.name).filter((name) => !hadSkills.has(name)),
    },
    predicted,
    raw,
    snapshot: loadout,
  };
};
