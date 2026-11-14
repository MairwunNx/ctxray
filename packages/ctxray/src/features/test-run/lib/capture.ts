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
import { createConversation, createTraceWriter, startEgressGuard, startProxy } from "#entities/proxy/index.ts";
import { type Config, egressOf, resolveNetwork } from "#entities/user-config/index.ts";
import type { HarnessId } from "#shared/contract/index.ts";
import type { Egress, Env } from "#shared/infra/index.ts";
import { createRedactor } from "#shared/redact/index.ts";
import type { Binaries } from "./binaries.ts";
import { fail } from "./failure.ts";
import type { CellScope } from "./scope.ts";

export type CaptureDeps = { config: Config; env: Env; self: readonly string[]; binaries: Binaries };

export type OpenRequest = { cwd: string; prompt: string };

// One harness session as the runner holds it: the harness side, and what a failure should point at.
export type OpenSession = {
  harness: HarnessSession;
  adapter: CaptureAdapter;
  model: string;
  trace: string;
  egress: () => readonly string[]; // connections the harness tried past ctxray during this session
};

const PROXY_VARIABLES = ["HTTPS_PROXY", "HTTP_PROXY", "ALL_PROXY", "NO_PROXY"];
const both = (name: string, value: string) => ({ [name]: value, [name.toLowerCase()]: value });

// The proxy and the egress guard live for the whole run, each harness session gets its own prefix and trace.
export const createCapture = ({ config, env, self, binaries }: CaptureDeps) => {
  const traceDir = join(tmpdir(), `ctxray-traces-${crypto.randomUUID().slice(0, 8)}`);
  const redactor = createRedactor(config.redact.patterns);
  const network = resolveNetwork(config, env);
  let resources: Promise<{ proxy: ReturnType<typeof startProxy>; guard: Awaited<ReturnType<typeof startEgressGuard>> }>;
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

  const open = async (scope: CellScope, { cwd, prompt }: OpenRequest): Promise<OpenSession> => {
    const adapter = CAPTURE_ADAPTERS[scope.harness] ?? fail("capture.noAdapter", { harness: scope.harness });
    const binary =
      (await binaries(scope.harness)) ??
      fail("capture.notInstalled", { harness: scope.harness, binary: adapter.binary });
    resources ??= (async () => ({ proxy: startProxy(), guard: await startEgressGuard() }))();
    const { proxy, guard } = await resources;
    egress ??= await egressOf(network);
    caFile ??= await caFileOf();
    const trace = join(traceDir, `${scope.harness}-${++count}.jsonl`);
    const writer = createTraceWriter(trace, redactor);
    const conversation = createConversation(writer.write);
    const prefix = proxy.open(conversation.handler);
    const model = config.harnesses[scope.harness]?.model ?? adapter.defaultModel;
    const seen = guard.attempts().length;
    const harness = await startSession({
      adapter,
      binary,
      copy: await copyOf(scope),
      inventory: scope.inventory,
      cwd,
      prompt,
      model,
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
      port: { ...conversation, baseUrl: prefix.baseUrl, close: prefix.close },
      remoteMcp: (target, onMessage) => proxy.openMcp(target, egress, onMessage),
      timeout: 60_000,
      user:
        config.harnesses[scope.harness]?.userScope === "inherit"
          ? { home: env["HOME"] ?? "", env, project: scope.workspace.root }
          : undefined,
    });
    return { harness, adapter, model, trace, egress: () => guard.attempts().slice(seen) };
  };

  const stop = async (keepTraces: boolean) => {
    if (resources) {
      const { proxy, guard } = await resources;
      await Promise.all([proxy.stop(), guard.stop()]);
    }
    if (!keepTraces) await rm(traceDir, { recursive: true, force: true });
    for (const copy of copies.values()) {
      await copy.then(({ work }) => rm(dirname(work), { recursive: true, force: true })).catch(() => {});
    }
  };

  return { open, stop };
};
export type Capture = ReturnType<typeof createCapture>;
