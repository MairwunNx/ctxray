import type { Message } from "../../catalog.ts";

// The source of truth: every other locale must hold exactly these keys.
export const en = {
  "count.harnesses": { one: "{count} harness", other: "{count} harnesses" },
  "count.tests": { one: "{count} test", other: "{count} tests" },
  "count.rules": { one: "{count} rule", other: "{count} rules" },
  "status.passed": "passed",
  "status.failed": "failed",
  "status.skipped": "skipped",
  "status.inconclusive": "inconclusive",
  "status.flaky": "flaky",
  "lang.unsupported": "Language “{lang}” isn't supported yet, so ctxray speaks English",
} as const satisfies Record<string, Message>;
