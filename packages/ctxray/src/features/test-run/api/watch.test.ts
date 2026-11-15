import { expect, test } from "bun:test";
import { join } from "node:path";
import { ignored } from "./watch.ts";

test.each<[string, boolean]>([
  ["CLAUDE.md", false],
  [join(".claude", "rules", "kotlin.md"), false],
  [join("tests", "a.ctxray.ts"), false],
  [join(".git", "index"), true],
  [join("node_modules", "x", "index.js"), true],
  [join("tests", "__snapshots__", "a.ctxray.snap.json"), true],
  [join("tests", "__cassettes__", "a.ctxray.ts.codex.json"), true],
  [join("out", "report", "index.html"), true],
])("%s is left alone: %p", (path, skipped) => {
  expect(ignored(path, join("out", "report"))).toBe(skipped);
});
