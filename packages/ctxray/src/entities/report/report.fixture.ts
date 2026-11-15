import type { LoadoutSnapshot, Report } from "#shared/contract/index.ts";

export const START: LoadoutSnapshot = {
  schemaVersion: 1,
  harness: { name: "claude-code", version: "2.1.311", model: "claude-sonnet-5-5" },
  mode: "capture",
  system: [{ id: "system:intro", tokens: 900 }],
  rules: [{ path: "CLAUDE.md", activation: "always", reason: "cwd:", tokens: 120 }],
  skills: { listed: [{ name: "refunds", path: ".claude/skills/refunds/SKILL.md", tokens: 30 }], loaded: [] },
  mcp: { servers: [{ name: "jira" }], tools: [{ server: "jira", name: "search", tokens: 400 }] },
  commands: [],
  tokens: {
    total: 2000,
    byComponent: { system: 900, rules: 120, skills: 30, mcp: 400, tools: 500 },
    byMcpServer: { jira: 400 },
    exact: false,
    method: "local:o200k_base",
  },
  provenance: { "rule:CLAUDE.md": { source: "CLAUDE.md", reason: "cwd:", evidence: "canary" } },
};

// A run of two tests on two harnesses: a pass, an unsupported skip, a failure with lines, and an
// inconclusive rate.
export const REPORT: Report = {
  schemaVersion: 1,
  ctxray: "0.1.0",
  createdAt: "2026-11-15T10:00:00.000Z",
  langs: ["en", "ru"],
  project: { name: "payments", root: "." },
  run: { backend: { kind: "replay" }, layers: ["L4", "L6"], duration: 4800 },
  summary: {
    passed: 1,
    failed: 1,
    skipped: 1,
    inconclusive: 1,
    flaky: 0,
    byLayer: {
      L4: { passed: 1, failed: 1, skipped: 0, inconclusive: 0, flaky: 0 },
      L6: { passed: 0, failed: 0, skipped: 1, inconclusive: 1, flaky: 0 },
    },
  },
  harnesses: [
    { id: "claude-code", title: "Claude Code", modes: ["static", "capture", "observe"], start: START },
    { id: "codex", title: "Codex", modes: ["static", "capture"] },
  ],
  tests: [
    {
      id: "tests/a.ctxray.ts#payments › context budget",
      file: "tests/a.ctxray.ts",
      suites: ["payments"],
      name: "context budget",
      layer: "L4",
      cells: [
        {
          harness: "claude-code",
          status: "passed",
          attempts: 1,
          duration: 2100,
          sessions: [{ start: START, peak: START, timeline: [{ turn: 0, added: ["CLAUDE.md"], tokens: 2000 }] }],
        },
        {
          harness: "codex",
          status: "failed",
          attempts: 1,
          duration: 1900,
          failure: {
            kind: "check",
            key: "expect.failed",
            params: {},
            message: "expect(received).toBeLessThan(25000)",
            lines: [{ label: "expect.received", value: "27104" }],
          },
        },
      ],
    },
    {
      id: "tests/a.ctxray.ts#payments › refunds",
      file: "tests/a.ctxray.ts",
      suites: ["payments"],
      name: "refunds <prompt>",
      layer: "L6",
      cells: [
        {
          harness: "claude-code",
          status: "inconclusive",
          attempts: 1,
          duration: 600,
          stats: [
            {
              subject: "skill(refunds)",
              successes: 4,
              samples: 5,
              rate: 0.8,
              low: 0.38,
              high: 0.96,
              threshold: { min: 0.5 },
              verdict: "inconclusive",
              needed: 11,
            },
          ],
          failure: { kind: "check", key: "activate.inconclusive", message: "skill(refunds) unsettled", lines: [] },
        },
        { harness: "codex", status: "skipped", reason: "unsupported", missing: ["skills"], attempts: 0, duration: 0 },
      ],
    },
  ],
  broken: [],
  coverage: [
    {
      harness: "claude-code",
      kinds: [{ activation: "always", total: 2, tested: 1 }],
      untested: ["app/CLAUDE.md"],
      dead: [],
      noPrompts: [],
    },
  ],
  base: {
    ref: "origin/master",
    diffs: [
      {
        harness: "claude-code",
        total: { before: 1800, after: 2000 },
        byComponent: {},
        changes: [{ component: "mcp", id: "jira/search", after: 400 }],
      },
    ],
  },
};
