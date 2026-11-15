import { expect, suite, test } from "@mairwunnx/ctxray";

// The L6 example of the test DSL. A real model picks the skill by its description: `--backend real --record`
// asks it and keeps its answers, `--backend replay` plays them back for free.
suite("payments", { fixture: "../payments" }, () => {
  test.activate(
    "refund prompt → refunds skill",
    { prompt: "Make a partial refund of 40 EUR for order 123.", samples: 5, requires: ["skills"] },
    ({ runs }) => {
      expect(runs).skill("refunds").toActivate({ min: 0.5 });
      expect(runs).skill("payouts").not.toActivate({ max: 0.5 });
    },
  );
});
