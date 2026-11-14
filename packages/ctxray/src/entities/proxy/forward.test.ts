import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRedactor } from "#shared/redact/index.ts";
import { startEgressGuard } from "./egress.ts";
import { createForward } from "./forward.ts";
import type { McpMessage } from "./mcp-forward.ts";
import type { Exchange } from "./model.ts";
import { startProxy } from "./server.ts";
import { createTraceWriter } from "./trace.ts";

const proxy = startProxy();
// A stand-in for the provider: it echoes what reached it.
const upstream = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch: async (request) =>
    Response.json({
      path: new URL(request.url).pathname + new URL(request.url).search,
      key: request.headers.get("x-api-key"),
      body: await request.json(),
    }),
});
afterAll(async () => {
  await proxy.stop();
  upstream.stop(true);
});

const NO_EGRESS = { proxy: undefined, noProxy: [], ca: [] };

describe("forward", () => {
  test("sends the request on through the upstream and keeps a copy", async () => {
    const seen: Exchange[] = [];
    const session = proxy.open(
      createForward({
        upstream: `${upstream.url.origin}/gateway`,
        egress: NO_EGRESS,
        headers: { "x-api-key": "real-key" },
        onExchange: (exchange) => seen.push(exchange),
      }),
    );
    const body = { tools: [{}], messages: [{ role: "user" }, { role: "assistant" }] };
    const response = await fetch(`${session.baseUrl}/v1/messages?beta=true`, {
      method: "POST",
      headers: { "x-api-key": "dummy" },
      body: JSON.stringify(body),
    });
    expect(await response.json()).toEqual({ path: "/gateway/v1/messages?beta=true", key: "real-key", body });
    expect(seen.map(({ position, protocol }) => [position, protocol])).toEqual([[1, "anthropic"]]);
    session.close();
  });

  test("answers a protocol error when the upstream is down", async () => {
    const session = proxy.open(createForward({ upstream: "http://127.0.0.1:9", egress: NO_EGRESS }));
    const response = await fetch(`${session.baseUrl}/v1/responses`, { method: "POST", body: "{}" });
    expect(response.status).toBe(502);
    expect(((await response.json()) as { error: { message: string } }).error.message).toContain("unreachable");
    session.close();
  });
});

describe("an HTTP MCP server behind the proxy", () => {
  test.each([
    ["JSON", "application/json", (body: string) => body],
    ["server-sent events", "text/event-stream", (body: string) => `event: message\ndata: ${body}\n\n`],
  ])("logs both sides of %s", async (_, contentType, frame) => {
    const mcp = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: async (request) => {
        const { id } = (await request.json()) as { id: number };
        const reply = JSON.stringify({ jsonrpc: "2.0", id, result: { tools: [{ name: "search_issues" }] } });
        return new Response(frame(reply), { headers: { "content-type": contentType } });
      },
    });
    const lines: McpMessage[] = [];
    const server = proxy.openMcp(`${mcp.url.origin}/mcp`, NO_EGRESS, (line) => lines.push(line));
    const call = { jsonrpc: "2.0", id: 7, method: "tools/list" };
    const response = await fetch(server.url, { method: "POST", body: JSON.stringify(call) });
    expect(await response.text()).toContain("search_issues");
    await Bun.sleep(10);
    expect(lines.map((line) => [line.from, (line.message as { id: number }).id])).toEqual([
      ["client", 7],
      ["server", 7],
    ]);
    server.close();
    mcp.stop(true);
  });
});

describe("egress guard", () => {
  test("refuses and remembers every connection", async () => {
    const guard = await startEgressGuard();
    await fetch("https://api.anthropic.com/v1/messages", { proxy: guard.url }).catch(() => undefined);
    await fetch("http://example.test/path", { proxy: guard.url }).catch(() => undefined);
    expect(guard.attempts()).toEqual(["api.anthropic.com:443", "example.test"]);
    await guard.stop();
  });
});

describe("trace", () => {
  test("redacts before it writes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ctxray-trace-"));
    const writer = createTraceWriter(join(dir, "nested", "trace.jsonl"), createRedactor());
    writer.write({
      seq: 0,
      session: "s",
      protocol: "anthropic",
      path: "/v1/messages",
      position: 0,
      retries: 0,
      userAgent: "claude-cli/2.1.311",
      headers: { "x-api-key": "sk-live-value" },
      body: { system: "Mail me at pavel@example.com" },
    });
    await writer.flush();
    const line = JSON.parse(await readFile(join(dir, "nested", "trace.jsonl"), "utf8")) as Exchange;
    expect([line.headers["x-api-key"], line.body["system"]]).toEqual([
      "⟦redacted:secret-field⟧",
      "Mail me at ⟦redacted:email⟧",
    ]);
    await rm(dir, { recursive: true });
  });
});
