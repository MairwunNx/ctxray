import { expect, test } from "bun:test";
import { createFormatters } from "./format.ts";

const nbsp = " ";

test.each([
  ["en", "number", 27104, "27,104"],
  ["ru", "number", 27104, `27${nbsp}104`],
  ["en", "compact", 21400, "21.4K"],
  ["ru", "compact", 21400, `21,4${nbsp}тыс.`],
  ["en", "percent", 0.95, "95%"],
  ["ru", "percent", 0.95, `95${nbsp}%`],
] as const)("%s %s(%p) → %s", (lang, kind, value, text) => {
  expect(createFormatters(lang)[kind](value)).toBe(text);
});
