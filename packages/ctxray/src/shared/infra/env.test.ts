import { expect, test } from "bun:test";
import { isCi } from "./env.ts";

test.each<[Record<string, string>, boolean]>([
  [{}, false],
  [{ CI: "true" }, true],
  [{ CI: "1" }, true],
  [{ GITLAB_CI: "true" }, true],
  [{ GITHUB_ACTIONS: "true" }, true],
  [{ CI: "false" }, false],
  [{ CI: "FALSE" }, false],
  [{ CI: "0" }, false],
  [{ CI: "" }, false],
  [{ CI: "false", GITLAB_CI: "true" }, true],
  [{ BUILD_ID: "7" }, false],
])("%p is CI: %p", (env, expected) => {
  expect(isCi(env)).toBe(expected);
});
