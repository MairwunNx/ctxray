import { expect, test } from "bun:test";
import { sandboxOf } from "./launch.ts";

test.each([
  ["root, the user of CI containers", 0, { IS_SANDBOX: "1" }],
  ["anyone else", 501, {}],
  ["Windows, which has no uid", undefined, {}],
])("IS_SANDBOX for %s", (_, uid, env) => {
  expect(sandboxOf(uid)).toEqual(env);
});
