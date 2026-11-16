---
name: write-tests
description: Write or fix ctxray tests (*.ctxray.ts) that check what an agent harness loads – rules on read, context budgets, skills a prompt picks. Use when the user asks to test their CLAUDE.md, rules, skills, or MCP setup with ctxray.
---

# Writing ctxray tests

ctxray tests check what Claude Code, Codex, Cursor, Gemini CLI, or OpenCode load into a model's context. A test file is `<name>.ctxray.ts` anywhere in the project and reads like a Bun or Vitest test. Run them with `ctxray test`.

```ts
import { corpus, discover, expect, suite, test } from "@mairwunnx/ctxray";
```

## Pick the layer

L1 (lint) and L2 (policies in `ctxray.config.ts`) run without tests. The method of `test` picks the layer:

| Method | Layer | What the test gets | Cost |
| --- | --- | --- | --- |
| `test.resolve` | L3 | `resolve({ cwd?, files? })`: what the harness would load, predicted from files | instant, no harness |
| `test.assemble` | L4 | `assemble({ cwd?, prompt? })`: the first request the real harness sends to a mock model | launches the harness |
| `test.wire` | L5 | `session`: drive the mock model turn by turn | launches the harness |
| `test.activate` | L6 | `runs`: which skills and rules a real model picked for prompts | needs `--backend real` or `replay` |
| `test.scenario` | L7 | `run`: one whole agent run against a real model | needs `--backend real` or `replay` |

Prefer the lowest layer that proves the point. Most rule tests are L3. Use L4 for budgets of the real request, because the system prompt and tool schemas only exist there.

## Shape

```ts
suite("payments", { fixture: "../payments" }, () => {   // fixture: the project folder, relative to this file
  test.resolve("payment rules load for payment code", async ({ resolve }) => {
    const l = await resolve({ cwd: "app", files: ["app/src/main/kotlin/payments/Charge.kt"] });
    expect(l.rules).toInclude(".claude/rules/payments.md");
    expect(l.rules.get(".claude/rules/payments.md").reason).toBe("glob:**/payments/**/*.kt");
    expect(l.rules).not.toInclude(".claude/rules/web.md");
  });
});
```

- `test.<kind>(name, body)` or `test.<kind>(name, options, body)`. Every test runs once per configured harness and gets `harness` in its context.
- Options: `requires` (capabilities: `skills`, `pathRules`, `intentRules`, `mcp`, `hooks`, `headless`, `proxyable`; a harness without one skips the test), `retries`, `timeout` (ms), `cwd` (L5–L7), and for L6/L7 `prompt`, `positive`, `negative`, `samples` (default 5 for L6, 1 for L7), `turns`, and `min` (L7 pass share).
- `expect.on("codex", () => …)` or `expect.on(["claude-code"], …)` scopes checks to some harnesses.
- Entry lists (`l.rules`, `l.skills.listed`, `l.mcp.servers`, …) are arrays with `.get(pathOrName)`.

## Matchers

- General: `toBe`, `toEqual` (an entry list against string ids compares ids in order), `toBeDefined`, `toBeUndefined`, `toHaveLength`, `toMatch`, `toInclude(idOrIds | rule | ruleSet)`, and `.not` before any of them.
- Budgets: `toBeLessThan`, `toBeLessThanOrEqual`, `toBeGreaterThan`, `toBeGreaterThanOrEqual` on `l.tokens.total` (L4), `l.tokens.known` (L3), `l.tokens.byComponent.rules`, `l.tokens.byMcpServer("jira")`.
- Snapshot: `expect(l).toMatchLoadoutSnapshot()` on an L3 or L4 loadout. Stored next to the test in `__snapshots__/`; `ctxray test -u` updates it.
- L5, on `await session.nextRequest()`: `toLoadRule(path)`, and `toAgreeWithResolver()`, which fails when the harness loaded something L3 didn't predict, or the other way round.
- L6, on `runs`, `runs.positive`, or `runs.negative`: `expect(runs).skill("refunds").toActivate({ min: 0.9 })`, `.rule(path)`, `.anyOf(ruleSetOrIds)`, and `expect(runs).skill("payouts").not.toActivate({ max: 0.1 })`. The verdict is statistical: too few samples give “inconclusive” with the number needed.

## L4 and L5

```ts
test.assemble("context budget", async ({ assemble }) => {
  const l = await assemble({ cwd: "app" });
  expect(l.tokens.total).toBeLessThan(25_000);
  expect(l.mcp.servers).toEqual(["github", "jira"]);
});

test.wire("nested instructions load on read", { requires: ["pathRules"] }, async ({ session }) => {
  await session.model.calls("Read", { path: "app/src/main/kotlin/payments/Charge.kt" });
  const next = await session.nextRequest();
  expect(next.loadout.rules).toInclude("app/src/main/kotlin/payments/AGENTS.md");
  expect(next).toAgreeWithResolver();
});
```

`session.model.calls(tool, input)` makes the mock model call a tool, `session.model.says(text)` makes it answer. Tool names are Claude Code's (`Read`, `Skill`); ctxray translates them for other harnesses.

## Many rules at once: discover and corpus

```ts
const payments = discover.rules({ owner: "@acme/payments" });   // or { under: "payments/" }, { activation: "path" }
const prompts = corpus("./prompts/payments.ts");                // { positive: [...], negative: [...] }

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

test.activate("payments prompts pick payments skills", { positive: prompts.positive, negative: prompts.negative }, ({ runs }) => {
  expect(runs.positive).anyOf(payments.where({ activation: "intent" })).toActivate({ min: 0.9 });
});
```

`owner` reads CODEOWNERS. Activation is `always`, `path` (instructions with globs), `intent` (skills the model picks), or `manual`. `ctxray gen-prompts --from-descriptions --out <file>` writes a corpus from the skills' descriptions.

## Running

- `ctxray test` runs everything. `--layer L1-L3` for a quick check, `--filter <text>` by name, `--harness claude-code,codex`.
- L6 and L7 need a real model: `ctxray test --backend real --record --budget 3` asks it once and keeps the answers, then `--backend replay` replays them for free in CI. Ask the user before running a real backend, because it costs money.
- A failed `toMatchLoadoutSnapshot` after an intended change: rerun with `-u` and show the user the diff.

## Habits

- One behaviour per test, named the way a person would say it: “payment rules load for payment code”.
- Check by path or name, never by token counts that move with every edit, except in explicit budgets.
- Add `requires` when a harness lacks the mechanism (Codex has no path rules), instead of `expect.on` branches.
- Before writing tests, run `ctxray inspect` (or the `inspect` tool of ctxray's MCP server) to see what the project loads now.
