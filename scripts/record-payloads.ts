// Records what Claude Code and Codex send for the capture fixture, for the segmenters' contract tests.
// Run after a harness upgrade: bun scripts/record-payloads.ts. Both harnesses must be on PATH.
import { join } from "node:path";
import { CAPTURE_ADAPTERS, openProject, STATIC_ADAPTERS, startSession } from "#ctxray/entities/harness/index.ts";
import { createConversation, startEgressGuard, startProxy } from "#ctxray/entities/proxy/index.ts";
import type { Exchange, HarnessId } from "#ctxray/shared/contract/index.ts";

const FIXTURE = "packages/ctxray/fixtures/capture/payments";
const OUT = "packages/ctxray/fixtures/payloads";
const READ = "app/src/main/kotlin/payments/Charge.kt";

// The copy's folder differs per run: `<work>` keeps the files stable. Headers carry nothing the tests need.
const stable = (exchange: Exchange, work: string, home: string) =>
  JSON.parse(
    JSON.stringify({ ...exchange, headers: {} })
      .replaceAll(work, "<work>")
      .replaceAll(home, "<home>"),
  );

const proxy = startProxy();
const guard = await startEgressGuard();
const project = await openProject(join(process.cwd(), FIXTURE));
for (const harness of ["claude-code", "codex"] as HarnessId[]) {
  const adapter = CAPTURE_ADAPTERS[harness];
  const binary = adapter && Bun.which(adapter.binary);
  if (!adapter || !binary) throw new Error(`${harness} isn't on PATH`);
  const inventory = await STATIC_ADAPTERS[harness]?.discover(project);
  if (!inventory) throw new Error(`${harness} has no static adapter`);
  const conversation = createConversation();
  const prefix = proxy.open(conversation.handler);
  const proxies = { HTTPS_PROXY: guard.url, HTTP_PROXY: guard.url, ALL_PROXY: guard.url, NO_PROXY: "127.0.0.1" };
  const session = await startSession({
    adapter,
    binary,
    project,
    inventory,
    cwd: "app",
    prompt: "Wait for instructions.",
    model: adapter.defaultModel,
    env: { PATH: process.env["PATH"] ?? "", TERM: "dumb", LANG: "en_US.UTF-8", TZ: "UTC", ...proxies },
    self: [process.execPath, join(process.cwd(), "packages/ctxray/src/app/main.ts")],
    shimEnv: { env: {}, unset: Object.keys(proxies), patterns: [] },
    port: { ...conversation, baseUrl: prefix.baseUrl, close: prefix.close },
    timeout: 60_000,
  });
  const { work, home } = session.dirs;
  const first = await session.request(0);
  await session.say(0, { tool: "Read", input: { path: READ } });
  const second = await session.request(1);
  const servers = await session.servers();
  await session.end();
  const record = { version: session.version, model: adapter.defaultModel, read: READ, servers };
  await Bun.write(join(OUT, `${harness}.json`), `${JSON.stringify(record, null, 2)}\n`);
  await Bun.write(join(OUT, `${harness}-0.json`), `${JSON.stringify(stable(first, work, home), null, 2)}\n`);
  await Bun.write(join(OUT, `${harness}-1.json`), `${JSON.stringify(stable(second, work, home), null, 2)}\n`);
  console.log(`${harness} ${session.version}: ${OUT}/${harness}-{0,1}.json`);
}
await proxy.stop();
await guard.stop();
if (guard.attempts().length > 0) throw new Error(`egress: ${guard.attempts().join(", ")}`);
