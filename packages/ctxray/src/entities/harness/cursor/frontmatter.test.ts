import { expect, test } from "bun:test";
import { cursorFrontmatter } from "./frontmatter.ts";

test.each<[string, string, Record<string, string | boolean | string[]>]>([
  ["a glob YAML rejects", "---\nglobs: *.md,*.MD\n---\nBody", { globs: "*.md,*.MD" }],
  [
    "true is a boolean, yes a string",
    "---\nalwaysApply: true\nother: yes\n---\nBody",
    { alwaysApply: true, other: "yes" },
  ],
  ["quotes come off", '---\ndescription: "Database work"\n---\nBody', { description: "Database work" }],
  [
    "a list under an empty key",
    "---\nglobs:\n  - src/**/*.ts\n  - 'test/**'\n---\nBody",
    { globs: ["src/**/*.ts", "test/**"] },
  ],
  ["no frontmatter", "Just text", {}],
])("%s", (_, text, data) => {
  const parsed = cursorFrontmatter(text);
  expect(parsed.data).toEqual(data);
  expect(parsed.body).toBe(text.startsWith("---") ? "Body" : text);
});
