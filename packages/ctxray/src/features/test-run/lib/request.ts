import { buildLoadout, STATIC_ADAPTERS } from "#entities/harness/index.ts";
import { exactSummary, type Piece } from "#entities/proxy/index.ts";
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

// The provider's own count in place of the local one. A failure says why rather than pass an estimate off.
const withExact = async (
  loadout: LoadoutSnapshot,
  session: OpenSession,
  raw: Exchange,
  pieces: readonly Piece[],
): Promise<LoadoutSnapshot> => {
  const model = typeof raw.body["model"] === "string" ? raw.body["model"] : (session.model.split("/").at(-1) ?? "");
  const counter = session.exact;
  if (!counter) return loadout;
  const exact = await exactSummary(counter, raw.protocol, model, raw.body, pieces, loadout.tokens).catch(
    (error: unknown) => fail("tokens.exactFailed", { protocol: raw.protocol, message: (error as Error).message }),
  );
  // Chat Completions has no count endpoint: its loadout keeps the local estimate, marked as one.
  if (!exact) return loadout;
  const { total, byComponent, byMcpServer, framing, method } = exact;
  return { ...loadout, tokens: { total, byComponent, byMcpServer, exact: true, method, framing } };
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
  const segments = session.adapter.segment(raw, session.harness.dirs.work);
  const built = buildLoadout({
    harness: { name: scope.harness, version: session.harness.version, model: session.model },
    segments,
    inventory: scope.inventory,
    predicted,
    servers: await session.harness.servers(),
    work: session.harness.dirs.work,
    first: raw.position === 0,
    aliases: session.harness.aliases,
  });
  const loadout = session.exact ? await withExact(built, session, raw, segments) : built;
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
