import { corpus, discover, expect, suite, test } from "@mairwunnx/ctxray";

// Rules picked by owner, not by name: CODEOWNERS says which belong to the payments team.
const payments = discover.rules({ owner: "@acme/payments" });
const prompts = corpus("./prompts/payments.ts");

suite("payments rules", { fixture: "../payments" }, () => {
  test.resolve.each(payments.where({ activation: "path" }))(
    "{rule.path} attaches to matching files",
    { requires: ["pathRules"] },
    async ({ rule, resolve }) => {
      for (const file of rule.matchingFiles({ sample: 3 })) {
        expect((await resolve({ files: [file] })).rules).toInclude(rule);
      }
      const other = rule.nonMatchingFile();
      if (other) expect((await resolve({ files: [other] })).rules).not.toInclude(rule);
    },
  );

  test.resolve("always rules of the payments zone", async ({ resolve }) => {
    const l = await resolve({ cwd: "app/src/main/kotlin/payments" });
    const always = payments.where({ activation: "always" });
    expect.on("codex", () => expect(l.rules).toInclude(always));
    // Claude Code skips AGENTS.md where a CLAUDE.md above is in charge: lint warns about it too.
    expect.on("claude-code", () => expect(l.rules).not.toInclude(always));
  });

  test.wire.each(payments.where({ activation: "path" }))("{rule.path} attaches on read", async ({ rule, session }) => {
    await session.model.calls("Read", { path: rule.matchingFiles({ sample: 1 })[0] });
  });

  test.activate(
    "payments intents activate payments skills",
    { positive: prompts.positive, negative: prompts.negative, samples: 5 },
    ({ runs }) => {
      expect(runs.positive)
        .anyOf(payments.where({ activation: "intent" }))
        .toActivate({ min: 0.9 });
    },
  );
});
