import { expect, test } from "bun:test";
import { ExitCode } from "./exit-code.ts";

// Changing a number breaks every pipeline that checks it: this test makes that a deliberate act.
test("exit codes stay as documented", () => {
  expect(ExitCode).toEqual({ ok: 0, failed: 1, usage: 2, config: 3, environment: 4, internal: 5, interrupted: 130 });
});
