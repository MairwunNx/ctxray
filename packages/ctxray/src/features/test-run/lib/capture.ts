import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  CAPTURE_ADAPTERS,
  type CaptureAdapter,
  canaryFiles,
  createCopy,
  type HarnessSession,
  type ProjectCopy,
  startSession,
} from "#entities/harness/index.ts";
import {
  createConversation,
  createRelay,
  createTraceWriter,
  type Handler,
  type Relay,
  startEgressGuard,
  startProxy,
} from "#entities/proxy/index.ts";
import { type Config, egressOf, resolveNetwork } from "#entities/user-config/index.ts";
import type { HarnessId } from "#shared/contract/index.ts";
import type { Egress, Env } from "#shared/infra/index.ts";
import { createRedactor } from "#shared/redact/index.ts";
import type { Binaries } from "./binaries.ts";
import { fail } from "./failure.ts";
import type { CellScope } from "./scope.ts";

export type CaptureDeps = { config: Config; env: Env; self: readonly string[]; binaries: Binaries };

// A model that answers by itself, real or replayed, in place of the mock a test drives. `inner` gets the
// session's project folder once the session has one.
export type RelaySpec = {
  inner: (work: () => readonly string[]) => Handler;
  maxTurns: number;
  refuse?: () => string | undefined;
};

export type OpenRequest = { cwd: string; prompt: string; relay?: RelaySpec | undefined };

// One harness session as the runner holds it: the harness side, and what a failure should point at.
export type OpenSession = {
  harness: HarnessSession;
  adapter: CaptureAdapter;
  model: string;
  trace: string;
  relay: Relay | undefined; // set when a real or replayed model answers
  egress: () => readonly string[]; // connections this harness tried past ctxray
  close: () => Promise<void>; // stops the session's egress guard
};

const PROXY_VARIABLES = ["HTTPS_PROXY", "HTTP_PROXY", "ALL_PROXY", "NO_PROXY"];
const both = (name: string, value: string) => ({ [name]: value, [name.toLowerCase()]: value });

// The proxy lives for the whole run, each harness session gets its own prefix, trace, and egress guard: sessions
// run side by side, and a guard of their own tells which harness tried to get past ctxray.
export const createCapture = ({ config, env, self, binaries }: CaptureDeps) => {
  const traceDir = join(tmpdir(), `ctxray-traces-${crypto.randomUUID().slice(0, 8)}`);
  const redactor = createRedactor(config.redact.patterns);
  const network = resolveNetwork(config, env);
  let proxy: ReturnType<typeof startProxy> | undefined;
  let count = 0;
  // Remote MCP servers go out the way the user's own tools do: their proxy and their CA certificates.
  let egress: Egress;
  // One committed copy per project for the whole run, with canaries for every harness ctxray can launch.
  const copies = new Map<string, Promise<ProjectCopy>>();
  const copyOf = (scope: CellScope) => {
    const { workspace } = scope;
    const made =
      copies.get(workspace.root) ??
      (async () => {
        const harnesses = Object.keys(CAPTURE_ADAPTERS) as HarnessId[];
        const inventories = await Promise.all(harnesses.map((harness) => workspace.inventoryOf(harness)));
        return createCopy(workspace.project, canaryFiles(inventories));
      })();
    copies.set(workspace.root, made);
    return made;
  };

  // MCP servers reach the network the way the user's own tools do: through the user's proxy, not the guard.
  const userNetwork = {
    ...(network.httpsProxy && both("HTTPS_PROXY", network.httpsProxy)),
    ...(network.httpProxy && both("HTTP_PROXY", network.httpProxy)),
    ...(network.noProxy.length > 0 && both("NO_PROXY", network.noProxy.join(","))),
  };
  const shimEnv = {
    env: userNetwork,
    unset: PROXY_VARIABLES.flatMap((name) => [name, name.toLowerCase()]).filter((name) => !(name in userNetwork)),
    patterns: config.redact.patterns.map(({ source, flags }) => ({ source, flags })),
  };

  // Node-based MCP servers trust the user's CA certificates through one PEM file (ADR 0003).
  let caFile: string | undefined;
  const caFileOf = async () => {
    if (network.caFiles.length <= 1) return network.caFiles[0];
    const file = join(traceDir, "ca.pem");
    await Bun.write(file, (await Promise.all(network.caFiles.map((one) => Bun.file(one).text()))).join("\n"));
    return file;
  };

  const open = async (scope: CellScope, { cwd, prompt, relay: spec }: OpenRequest): Promise<OpenSession> => {
    const adapter = CAPTURE_ADAPTERS[scope.harness] ?? fail("capture.noAdapter", { harness: scope.harness });
    const binary =
      (await binaries(scope.harness)) ??
      fail("capture.notInstalled", { harness: scope.harness, binary: adapter.binary });
    proxy ??= startProxy();
    const server = proxy;
    const guard = await startEgressGuard();
    egress ??= await egressOf(network);
    caFile ??= await caFileOf();
    const trace = join(traceDir, `${scope.harness}-${++count}.jsonl`);
    const writer = createTraceWriter(trace, redactor);
    let work: readonly string[] = [];
    const relay =
      spec &&
      createRelay(
        spec.inner(() => work),
        { ...spec, onExchange: writer.write },
      );
    const answers = relay
      ? { handler: relay.handler, turn: relay.turn, answer: () => {}, finish: () => {} }
      : createConversation(writer.write);
    const prefix = server.open(answers.handler);
    const settings = config.harnesses[scope.harness];
    const model = settings?.model ?? adapter.defaultModel;
    // A harness that fails to start takes its guard down with it.
    const harness = await startSession({
      adapter,
      binary,
      copy: await copyOf(scope),
      inventory: scope.inventory,
      cwd,
      prompt,
      model,
      provider: settings?.provider,
      env: {
        PATH: env["PATH"] ?? "/usr/bin:/bin",
        TERM: "dumb",
        LANG: "en_US.UTF-8",
        TZ: "UTC",
        ...both("HTTPS_PROXY", guard.url),
        ...both("HTTP_PROXY", guard.url),
        ...both("ALL_PROXY", guard.url),
        ...both("NO_PROXY", "127.0.0.1,localhost"),
      },
      mcp: { self, shimEnv: caFile ? { ...shimEnv, env: { ...shimEnv.env, NODE_EXTRA_CA_CERTS: caFile } } : shimEnv },
      port: {
        turn: answers.turn,
        answer: answers.answer,
        finish: answers.finish,
        baseUrl: prefix.baseUrl,
        close: prefix.close,
      },
      onDirs: (dirs) => {
        work = [dirs.work, dirs.root];
      },
      remoteMcp: (target, onMessage) => server.openMcp(target, egress, onMessage),
      timeout: 60_000,
      user:
        config.harnesses[scope.harness]?.userScope === "inherit"
          ? { home: env["HOME"] ?? "", env, project: scope.workspace.root }
          : undefined,
    }).catch(async (error: unknown) => {
      await guard.stop();
      throw error;
    });
    // The provider changes the payload too, so it joins the model in the snapshot key: `anthropic/claude-…`.
    const label = settings?.provider ? `${settings.provider}/${model}` : model;
    return { harness, adapter, model: label, trace, relay, egress: guard.attempts, close: guard.stop };
  };

  const stop = async (keepTraces: boolean) => {
    await proxy?.stop();
    if (!keepTraces) await rm(traceDir, { recursive: true, force: true });
    for (const copy of copies.values()) {
      await copy.then(({ work }) => rm(dirname(work), { recursive: true, force: true })).catch(() => {});
    }
  };

  return { open, stop };
};
export type Capture = ReturnType<typeof createCapture>;
