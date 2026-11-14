import { buildLoadout, HarnessExit, STATIC_ADAPTERS } from "#entities/harness/index.ts";
import type { Exchange } from "#shared/contract/index.ts";
import type { Capture, OpenSession } from "./capture.ts";
import { type CapturedLoadout, type CapturedRequest, toCaptured } from "./captured.ts";
import { fail } from "./failure.ts";
import type { CellScope } from "./scope.ts";

// A harness at work against the mock model. The test plays the model: each call answers the harness's
// latest request, and nextRequest() waits for the request that follows.
export type Session = {
  harness: string;
  firstRequest: () => Promise<CapturedRequest>;
  nextRequest: () => Promise<CapturedRequest>;
  model: {
    calls: (tool: string, input?: Record<string, unknown>) => Promise<void>;
    says: (text: string) => Promise<void>;
  };
  // The harness's own events: Claude Code's stream-json, Codex's --json. The session must have started.
  events: () => Promise<readonly unknown[]>;
  end: () => Promise<void>;
};

export type SessionRequest = { cwd?: string; prompt?: string };

const DEFAULT_PROMPT = "Wait for instructions.";

const lastLines = (text: string) => text.split("\n").slice(-12).join("\n");

// Opens the harness on first use, so a test that never touches its session launches nothing.
export const createSession = (capture: Capture, scope: CellScope, request: SessionRequest = {}) => {
  const cwd = request.cwd ?? "";
  let opened: Promise<OpenSession> | undefined;
  let position = 0;
  let ended = false;
  const files: string[] = [];
  const built = new Map<number, CapturedRequest>();
  const open = () => {
    opened ??= capture.open(scope, { cwd, prompt: request.prompt ?? DEFAULT_PROMPT });
    return opened;
  };

  const exited = (session: OpenSession, error: unknown): never => {
    if (!(error instanceof HarnessExit)) throw error;
    const output = { label: "capture.output" as const, value: lastLines(error.output) || "—" };
    return fail("capture.exited", { harness: scope.harness, code: String(error.code ?? "timeout") }, [
      output,
      { label: "capture.trace", value: session.trace },
    ]);
  };

  const build = async (index: number): Promise<CapturedRequest> => {
    const cached = built.get(index);
    if (cached) return cached;
    const session = await open();
    const raw: Exchange = await session.harness.request(index).catch((error) => exited(session, error));
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
      first: index === 0,
      aliases: session.harness.aliases,
    });
    const before = index > 0 ? (await build(index - 1)).loadout : undefined;
    const hadRules = new Set(before?.rules.map((rule) => rule.path));
    const hadSkills = new Set(before?.skills.loaded.map((skill) => skill.name));
    const view: CapturedLoadout = toCaptured(loadout);
    const request: CapturedRequest = {
      kind: "request",
      index,
      loadout: view,
      added: {
        rules: loadout.rules.map((rule) => rule.path).filter((path) => !hadRules.has(path)),
        skills: loadout.skills.loaded.map((skill) => skill.name).filter((name) => !hadSkills.has(name)),
      },
      predicted,
      raw,
      snapshot: loadout,
    };
    built.set(index, request);
    return request;
  };

  const answer = async (said: Parameters<OpenSession["harness"]["say"]>[1]) => {
    if (ended) fail("capture.ended");
    const session = await open();
    await session.harness.say(position, said).catch((error) => exited(session, error));
    position++;
  };

  const session: Session = {
    harness: scope.harness,
    firstRequest: () => build(0),
    nextRequest: () => build(position),
    model: {
      calls: async (tool, input = {}) => {
        await answer({ tool, input });
        if (tool === "Read" && typeof input["path"] === "string") files.push(input["path"]);
      },
      says: (text) => answer({ text }),
    },
    events: async () => (await open()).harness.events(),
    end: async () => {
      if (ended || !opened) return;
      ended = true;
      const session = await opened;
      const result = await session.harness.end();
      const egress = session.egress().filter((host) => !session.adapter.probes?.includes(host));
      if (egress.length > 0) {
        fail("capture.egress", { harness: scope.harness, hosts: [...new Set(egress)].join(", ") }, [
          { label: "capture.trace", value: session.trace },
        ]);
      }
      if (result.code !== 0 && result.code !== null) {
        fail("capture.exited", { harness: scope.harness, code: String(result.code) }, [
          { label: "capture.output", value: lastLines(result.output) || "—" },
          { label: "capture.trace", value: session.trace },
        ]);
      }
    },
  };
  return session;
};
