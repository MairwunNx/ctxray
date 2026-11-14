import { describe, expect, test } from "bun:test";
import { firstLine, flagOf, listOf, splitFrontmatter } from "./frontmatter.ts";
import { findImports, findLinks } from "./references.ts";

describe("splitFrontmatter", () => {
  test.each<[string, string, Record<string, unknown>, string, number]>([
    ["no frontmatter", "Body\n", {}, "Body\n", 0],
    ["a mapping", "---\npaths: src/**\n---\nBody\n", { paths: "src/**" }, "Body\n", 3],
    ["an empty block", "---\n---\nBody", {}, "Body", 2],
    ["CRLF line ends", "---\r\nname: x\r\n---\r\nBody", { name: "x" }, "Body", 3],
    ["a block not on the first line", "\n---\nname: x\n---\n", {}, "\n---\nname: x\n---\n", 0],
  ])("%s", (_, text, data, body, offset) => {
    expect(splitFrontmatter(text)).toEqual({ data, body, offset });
  });

  test.each([
    ["broken YAML", "---\npaths: [open\n---\nBody"],
    ["a list instead of a mapping", "---\n- a\n---\nBody"],
  ])("reports %s and keeps the body", (_, text) => {
    const result = splitFrontmatter(text);
    expect(result.error).toBeString();
    expect(result.body).toBe("Body");
  });
});

describe("field readers", () => {
  test.each<[unknown, string[] | undefined]>([
    ["**/*.ts, docs/**", ["**/*.ts", "docs/**"]],
    [
      ["a", "b"],
      ["a", "b"],
    ],
    [undefined, undefined],
  ])("listOf(%j) is %j", (value, list) => {
    expect(listOf(value)).toEqual(list);
  });

  test.each<[unknown, boolean | undefined]>([
    [true, true],
    ["yes", true],
    ["ON", true],
    [1, true],
    ["off", false],
    ["0", false],
    ["maybe", undefined],
  ])("flagOf(%j) is %p", (value, flag) => {
    expect(flagOf(value)).toBe(flag);
  });

  test("firstLine skips blank lines", () => {
    expect(firstLine("\n\n  Use it for refunds.  \nMore")).toBe("Use it for refunds.");
  });
});

describe("findImports", () => {
  test.each<[string, string, string[]]>([
    ["a line of its own", "@docs/a.md", ["docs/a.md"]],
    ["inside a sentence, with punctuation", "See @README and @package.json.", ["README", "package.json"]],
    ["an escaped space", "@Design\\ Docs/api.md", ["Design Docs/api.md"]],
    ["an email is no import", "Mail me at me@example.test", []],
    ["a code span", "Write `@README` to keep it literal", []],
    ["a fenced block", "```\n@docs/a.md\n```\n@docs/b.md", ["docs/b.md"]],
    ["a longer fence holds a shorter one", "````\n```\n@x.md\n```\n````", []],
  ])("%s", (_, text, targets) => {
    expect(findImports(text).map((reference) => reference.target)).toEqual(targets);
  });

  test("counts lines from 1, code blocks included", () => {
    expect(findImports("```\nx\n```\n@a.md")).toEqual([{ target: "a.md", line: 4 }]);
  });
});

describe("findLinks", () => {
  test.each<[string, string, string[]]>([
    ["a relative link", "[setup](docs/setup.md)", ["docs/setup.md"]],
    ["an image with a title", '![logo](img/logo.png "Logo")', ["img/logo.png"]],
    ["an anchor and a query go", "[a](guide.md#install) [b](x.md?raw=1)", ["guide.md", "x.md"]],
    ["URLs, anchors, and root paths stay out", "[a](https://x.test) [b](#top) [c](/abs) [d](mailto:x@y)", []],
    ["percent-encoding", "[a](My%20Docs/a.md)", ["My Docs/a.md"]],
    ["a space inside angle brackets", "[a](<docs/a b.md>)", ["docs/a b.md"]],
  ])("%s", (_, text, targets) => {
    expect(findLinks(text).map((reference) => reference.target)).toEqual(targets);
  });
});
