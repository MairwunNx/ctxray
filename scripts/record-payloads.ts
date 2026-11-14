// Records what the harnesses send for the capture fixture, for the segmenters' contract tests. Run after a
// harness upgrade: bun scripts/record-payloads.ts [harness…]. Each comes from the ctxray cache as the
// fixture's ctxray.lock pins it (`ctxray harness install` there first), or else from PATH.
import { rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  CAPTURE_ADAPTERS,
  canaryFiles,
  createCopy,
  openProject,
  STATIC_ADAPTERS,
  startSession,
} from "#ctxray/entities/harness/index.ts";
import { createHarnessCache, resolveCacheDirs } from "#ctxray/entities/harness-cache/index.ts";
import { readLockfile } from "#ctxray/entities/lockfile/index.ts";
import { createConversation, startEgressGuard, startProxy } from "#ctxray/entities/proxy/index.ts";
import type { Exchange, HarnessId } from "#ctxray/shared/contract/index.ts";
import { currentPlatform } from "#ctxray/shared/infra/index.ts";

const FIXTURE = "packages/ctxray/fixtures/capture/payments";
const OUT = "packages/ctxray/fixtures/payloads";
const READ = "app/src/main/kotlin/payments/Charge.kt";

// The copy's folder differs per run: `<work>` keeps the files stable, `<harness>` hides where the cache
// lives, like the built-in skills Gemini CLI lists. Headers carry nothing the tests need.
const stable = (
  exchange: Exchange,
  { work, home, root }: { work: string; home: string; root: string },
  binary: string,
) => {
  const install = binary.includes("/package/") ? binary.slice(0, binary.indexOf("/package/")) : binary;
  return JSON.parse(
    JSON.stringify({ ...exchange, headers: {} })
      .replaceAll(work, "<work>")
      // Cursor names a project's folders after its path: `private-var-folders-…-work`.
      .replaceAll(work.replace(/^\//, "").replace(/[^a-zA-Z0-9]/g, "-"), "<work-slug>")
      .replaceAll(home, "<home>")
      .replaceAll(root, "<run>")
      .replaceAll(install, "<harness>"),
  );
};

const cache = createHarnessCache(await resolveCacheDirs(process.env));
const lock = await readLockfile("packages/ctxray/fixtures/capture/ctxray.lock");
const binaryOf = async (harness: HarnessId, name: string) => {
  const locked = lock?.harnesses[harness];
  const found = locked?.source === "registry" ? await cache.find(harness, locked, currentPlatform()) : undefined;
  return found?.binary ?? Bun.which(name);
};

const proxy = startProxy();
const guard = await startEgressGuard();
const project = await openProject(join(process.cwd(), FIXTURE));
const wanted = process.argv.length > 2 ? process.argv.slice(2) : Object.keys(CAPTURE_ADAPTERS);
for (const harness of wanted as HarnessId[]) {
  const adapter = CAPTURE_ADAPTERS[harness];
  const binary = adapter && (await binaryOf(harness, adapter.binary));
  if (!adapter || !binary) throw new Error(`${harness} is neither in the cache nor on PATH`);
  const inventory = await STATIC_ADAPTERS[harness]?.discover(project);
  if (!inventory) throw new Error(`${harness} has no static adapter`);
  const copy = await createCopy(project, canaryFiles([inventory]));
  const conversation = createConversation();
  const prefix = proxy.open(conversation.handler);
  const proxies = { HTTPS_PROXY: guard.url, HTTP_PROXY: guard.url, ALL_PROXY: guard.url, NO_PROXY: "127.0.0.1" };
  const session = await startSession({
    adapter,
    binary,
    copy,
    inventory,
    cwd: "app",
    prompt: "Wait for instructions.",
    model: adapter.defaultModel,
    env: { PATH: process.env["PATH"] ?? "", TERM: "dumb", LANG: "en_US.UTF-8", TZ: "UTC", ...proxies },
    mcp: {
      self: [process.execPath, join(process.cwd(), "packages/ctxray/src/app/main.ts")],
      shimEnv: { env: {}, unset: Object.keys(proxies), patterns: [] },
    },
    remoteMcp: (target, onMessage) => proxy.openMcp(target, { proxy: undefined, noProxy: [], ca: [] }, onMessage),
    port: { ...conversation, baseUrl: prefix.baseUrl, close: prefix.close },
    timeout: 60_000,
  });
  const { dirs } = session;
  const first = await session.request(0);
  await session.say(0, { tool: "Read", input: { path: READ } });
  const second = await session.request(1);
  const servers = await session.servers();
  await session.end();
  await rm(dirname(copy.work), { recursive: true, force: true });
  const record = { version: session.version, model: adapter.defaultModel, read: READ, servers };
  await Bun.write(join(OUT, `${harness}.json`), `${JSON.stringify(record, null, 2)}\n`);
  await Bun.write(join(OUT, `${harness}-0.json`), `${JSON.stringify(stable(first, dirs, binary), null, 2)}\n`);
  await Bun.write(join(OUT, `${harness}-1.json`), `${JSON.stringify(stable(second, dirs, binary), null, 2)}\n`);
  console.log(`${harness} ${session.version}: ${OUT}/${harness}-{0,1}.json`);
}
await proxy.stop();
await guard.stop();
// Hosts a harness reaches for on its own and runs fine without, like Cursor's telemetry, don't count.
const probes = new Set(Object.values(CAPTURE_ADAPTERS).flatMap((adapter) => adapter?.probes ?? []));
const leaks = guard.attempts().filter((host) => !probes.has(host));
if (leaks.length > 0) throw new Error(`egress: ${leaks.join(", ")}`);
