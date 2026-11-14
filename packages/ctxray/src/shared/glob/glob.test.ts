import { describe, expect, test } from "bun:test";
import { globProblem, isGlob, matchesGitignore } from "./glob.ts";

describe("globProblem", () => {
  test.each<[string, string | undefined]>([
    ["src/**/*.{ts,tsx}", undefined],
    ["[abc].md", undefined],
    ["\\{literal", undefined],
    ["", "empty"],
    ["  ", "empty"],
    ["src/**/*.{ts", "unbalanced"],
    ["a]", "unbalanced"],
    ["{a,[b}]", "unbalanced"],
    ["../shared/**", "outside"],
  ])("%j: %p", (pattern, problem) => {
    expect(globProblem(pattern)).toBe(problem as never);
  });
});

describe("matchesGitignore", () => {
  test.each<[string, string, boolean]>([
    ["*.md", "README.md", true],
    ["*.md", "docs/deep/a.md", true],
    ["/*.md", "README.md", true],
    ["/*.md", "docs/a.md", false],
    ["src/components/*.tsx", "src/components/a.tsx", true],
    ["src/components/*.tsx", "src/components/x/a.tsx", false],
    ["src/**/*", "src/a/b.ts", true],
    ["**/payments/**/*.kt", "app/src/payments/Charge.kt", true],
    ["src/**/*.{ts,tsx}", "src/a.tsx", true],
    ["docs/", "docs/a/b.md", true],
    ["{a,b}/{c,d}/*.kt", "b/c/X.kt", true],
    ["{1..5000}.md", "7.md", false],
    ["{1..5000}.md", "{1..5000}.md", true],
  ])("%s on %s: %p", (pattern, path, matches) => {
    expect(matchesGitignore(pattern, path)).toBe(matches);
  });
});

test.each<[string, boolean]>([
  ["AGENTS.md", false],
  ["docs/*.md", true],
  ["src/{a,b}.ts", true],
])("isGlob(%j) is %p", (pattern, glob) => {
  expect(isGlob(pattern)).toBe(glob);
});
