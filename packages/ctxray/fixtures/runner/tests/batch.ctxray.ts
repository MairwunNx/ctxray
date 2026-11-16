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
    // Codex reads the AGENTS.md, Claude Code the CLAUDE.md beside it, which imports the AGENTS.md.
    expect(l.rules).toInclude(always);
  });

  test.activate(
    "payments intents activate payments skills",
    // Without `samples`, the positive prompts share 16 runs: the fewest that can prove the default 0.8.
    { positive: prompts.positive, negative: prompts.negative },
    ({ runs }) => {
      expect(runs.positive)
        .anyOf(payments.where({ activation: "intent" }))
        .toActivate();
    },
  );
});
