import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readShimLog } from "./read.ts";
import type { ShimConfig } from "./shim.ts";

const MAIN = join(import.meta.dir, "../../app/main.ts");
const SERVER = join(import.meta.dir, "../../../fixtures/capture/payments/mcp/server.ts");

const messages = [
  { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } },
  { jsonrpc: "2.0", method: "notifications/initialized" },
  { jsonrpc: "2.0", id: 2, method: "tools/list" },
  {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "search_issues", arguments: { jql: "owner = pavel@example.com" } },
  },
];

describe("mcp shim", () => {
  test("passes the conversation through and logs it, redacted", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ctxray-shim-"));
    const config: ShimConfig = { log: join(dir, "jira.jsonl"), env: { SHIM_CHECK: "1" }, unset: [], patterns: [] };
    await Bun.write(join(dir, "shim.json"), JSON.stringify(config));
    const shim = Bun.spawn(["bun", MAIN, "__mcp-shim", join(dir, "shim.json"), "--", "bun", SERVER, "jira"], {
      stdin: new Blob([messages.map((message) => `${JSON.stringify(message)}\n`).join("")]),
      stdout: "pipe",
    });
    const replies = (await new Response(shim.stdout).text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(await shim.exited).toBe(0);
    expect(replies.map((reply) => reply.id)).toEqual([1, 2, 3]);

    const record = readShimLog(await readFile(config.log, "utf8"));
    expect(record.info).toEqual({ name: "jira", version: "1.0.0" });
    expect(record.instructions).toContain("PAY project");
    expect(record.tools.map((tool) => tool.name)).toEqual(["search_issues"]);
    expect(record.calls).toEqual([{ name: "search_issues", arguments: { jql: "owner = ⟦redacted:email⟧" } }]);
    await rm(dir, { recursive: true });
  });

  test("explains its usage", async () => {
    const shim = Bun.spawn(["bun", MAIN, "__mcp-shim"], { stderr: "pipe" });
    expect(await shim.exited).toBe(2);
    expect(await new Response(shim.stderr).text()).toContain("usage: ctxray __mcp-shim");
  });
});
