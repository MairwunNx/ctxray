import { expect, suite, test } from "@mairwunnx/ctxray";

// The examples of the test DSL, adapted to the payments fixture.
suite("payments", { fixture: "../payments" }, () => {
  // L3 needs no prompt: path rules depend only on the files the agent works with.
  test.resolve("payments rules attach to payment sources", { requires: ["pathRules"] }, async ({ resolve }) => {
    const l = await resolve({ cwd: "app", files: ["app/src/main/kotlin/payments/Charge.kt"] });
    expect(l.rules).toInclude([".claude/rules/kotlin.md", ".claude/rules/payments.md"]);
    expect(l.rules).not.toInclude(".claude/rules/web.md");
    expect(l.rules.get(".claude/rules/payments.md").reason).toBe("glob:**/payments/**/*.kt");
  });

  test.resolve("instructions of the app load in app", async ({ resolve }) => {
    const l = await resolve({ cwd: "app" });
    expect(l.rules).toInclude("app/AGENTS.md");
    expect.on("codex", () => expect(l.rules).toInclude("AGENTS.md"));
    // Claude Code takes the root CLAUDE.md here, but not what it imports: only the cwd's own imports expand.
    expect.on("claude-code", () => expect(l.rules).toInclude(["CLAUDE.md", "app/CLAUDE.md"]));
    expect.on("claude-code", () => expect(l.rules).not.toInclude("AGENTS.md"));
    expect(l).toMatchLoadoutSnapshot();
  });

  // L4 and L5 launch harnesses: fixtures/capture holds those examples.
  test.activate(
    "refund prompt → refunds skill",
    { prompt: "Make a partial refund for order 123", samples: 20, requires: ["skills"] },
    ({ runs }) => {
      expect(runs).skill("refunds").toActivate({ min: 0.8 });
    },
  );
});
