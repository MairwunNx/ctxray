import { discover, expect, suite, test } from "@mairwunnx/ctxray";

// Rules picked by owner, not by name: CODEOWNERS says which belong to the payments team.
const payments = discover.rules({ owner: "@acme/payments" });

suite("payments rules", { fixture: "../payments" }, () => {
  // The always rules live in the payments package: the agent starts there.
  test.assemble("always rules present in payments zone", async ({ assemble }) => {
    const always = payments.where({ activation: "always" });
    const l = await assemble({ cwd: always.root });
    expect(l.rules).toInclude(always);
  });

  // The payments package's own instructions: every harness with path rules loads them once the agent works there.
  test.wire.each(payments.where({ under: "app/src/main/kotlin/payments" }))(
    "{rule.path} attaches on read",
    { requires: ["pathRules"] },
    async ({ rule, session }) => {
      for (const file of rule.matchingFiles({ sample: 3 })) {
        await session.model.calls("Read", { path: file });
        expect(await session.nextRequest()).toLoadRule(rule);
      }
      const other = rule.nonMatchingFile();
      if (other) {
        await session.model.calls("Read", { path: other });
        expect(await session.nextRequest()).not.toLoadRule(rule);
      }
    },
  );
});
