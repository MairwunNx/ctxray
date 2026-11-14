import { expect, suite, test } from "@mairwunnx/ctxray";

// The L4 and L5 examples of the test DSL, adapted to the payments fixture.
suite("payments", { fixture: "../payments" }, () => {
  // L4: the real harness, the mock model, the first request.
  test.assemble("context budget", async ({ assemble }) => {
    const l = await assemble({ cwd: "app" });
    expect(l.tokens.total).toBeLessThan(25_000);
    expect(l.tokens.byMcpServer("jira")).toBeLessThan(3_000);
    expect(l.mcp.servers).toEqual(["github", "jira"]);
    expect(l).toMatchLoadoutSnapshot();
  });

  // L5: the mock model reads a file. The nested AGENTS.md loads, through CLAUDE.md's import in Claude Code.
  // Codex has no path rules.
  test.wire("nested instructions load on read", { requires: ["pathRules"] }, async ({ session }) => {
    await session.model.calls("Read", { path: "app/src/main/kotlin/payments/Charge.kt" });
    const next = await session.nextRequest();
    expect(next.loadout.rules).toInclude("app/src/main/kotlin/payments/AGENTS.md");
    expect(next).toAgreeWithResolver();
    // The harness's own stream: Claude Code's init event names the MCP servers it connected.
    await expect.on(["claude-code"], async () => {
      const init = (await session.events()).find((event) => (event as { subtype?: string }).subtype === "init");
      expect((init as { mcp_servers?: unknown[] } | undefined)?.mcp_servers).toHaveLength(2);
    });
  });
});
