import { describe, expect, test } from "bun:test";
import type { Message } from "./catalog.ts";
import { CATALOGS } from "./locales/index.ts";

const source = CATALOGS["en"] ?? {};
const locales = Object.entries(CATALOGS);
const placeholders = (message: Message) =>
  [
    ...new Set(
      Object.values(typeof message === "string" ? { other: message } : message)
        .join(" ")
        .match(/\{\w+\}/g),
    ),
  ].sort();

// The typecheck already demands every key; these catch what types can't: plural forms and placeholders.
describe.each(locales)("%s", (lang, catalog) => {
  test("holds exactly the English keys", () => {
    expect(Object.keys(catalog).sort()).toEqual(Object.keys(source).sort());
  });

  const plurals = Object.entries(catalog).filter(([, message]) => typeof message !== "string");
  const categories = new Intl.PluralRules(lang).resolvedOptions().pluralCategories;

  test.each(plurals)("%s has every plural form the locale uses", (_, message) => {
    expect(Object.keys(message).sort()).toEqual([...categories].sort());
  });

  test.each(Object.entries(catalog))("%s uses the English placeholders", (key, message) => {
    expect(placeholders(message)).toEqual(placeholders(source[key as keyof typeof source]));
  });
});
