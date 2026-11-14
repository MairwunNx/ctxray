import { describe, expect, test } from "bun:test";
import { goToJs } from "./go-regex.ts";

describe("goToJs", () => {
  test.each([
    ["(?i)abc", "(?i:abc)"],
    ["\\b(p8e-(?i)[a-z0-9]{32})(?:x|$)", "\\b(p8e-(?i:[a-z0-9]{32}))(?:x|$)"],
    ["a(?i)b|c", "a(?i:b|c)"],
    ["(x(?i)[a-z](y))z", "(x(?i:[a-z](y)))z"],
    ["a(?i)[)(]b", "a(?i:[)(]b)"],
    ["a(?i)\\)b", "a(?i:\\)b)"],
    ["(?i)a(?-i:B)c", "(?i:a(?-i:B)c)"],
    ["(?i)\\b(x(?i)y)", "(?i:\\b(x(?i:y)))"],
    ["(?P<alg>ab)", "(?<alg>ab)"],
    ["abc\\z", "abc$"],
    ["\\Aabc", "^abc"],
    ["[[:alnum:]_]+", "[A-Za-z0-9_]+"],
    ["(?s)a.b", "(?s:a.b)"],
  ])("%s", (go, js) => {
    expect(goToJs(go)).toBe(js);
    expect(() => new RegExp(js)).not.toThrow();
  });

  test("keeps the meaning of a mid-pattern flag", () => {
    const regex = new RegExp(goToJs("lin_api_(?i)[a-z0-9]{4}"));
    expect(regex.test("lin_api_AbC1")).toBe(true);
    expect(regex.test("LIN_API_abc1")).toBe(false);
  });
});
