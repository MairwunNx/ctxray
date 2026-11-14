import { describe, expect, test } from "bun:test";
import type { Catalog } from "./catalog-type.ts";
import { CATALOGS } from "./locales/index.ts";
import { createTranslator } from "./translate.ts";

describe("plurals", () => {
  test.each([
    ["en", 0, "0 tests"],
    ["en", 1, "1 test"],
    ["en", 2, "2 tests"],
    ["en", 1000, "1,000 tests"],
    ["ru", 0, "0 тестов"],
    ["ru", 1, "1 тест"],
    ["ru", 2, "2 теста"],
    ["ru", 4, "4 теста"],
    ["ru", 5, "5 тестов"],
    ["ru", 11, "11 тестов"],
    ["ru", 12, "12 тестов"],
    ["ru", 21, "21 тест"],
    ["ru", 22, "22 теста"],
    ["ru", 25, "25 тестов"],
    ["ru", 101, "101 тест"],
    ["ru", 1.5, "1,5 теста"],
    ["ru", 12345, "12\u00a0345 тестов"], // Russian groups digits with a no-break space
  ])("%s: %p → %s", (lang, count, text) => {
    expect(createTranslator(lang)("count.tests", { count })).toBe(text);
  });
});

describe("templates", () => {
  test("fills named placeholders", () => {
    expect(createTranslator("ru")("lang.unsupported", { lang: "de" })).toBe(
      "Язык «de» пока не поддерживается, поэтому ctxray говорит по-английски",
    );
  });

  test("leaves a placeholder without a value as it is", () => {
    expect(createTranslator("en")("lang.unsupported")).toContain("{lang}");
  });
});

describe("a third locale", () => {
  // Built from data only: the translator needs no change for a new language.
  const de: Catalog = {
    ...CATALOGS["en"],
    "count.tests": { one: "{count} Test", other: "{count} Tests" },
    "status.passed": "bestanden",
  } as Catalog;

  test.each([
    [1, "1 Test"],
    [7, "7 Tests"],
    [1234, "1.234 Tests"],
  ])("de: %p → %s", (count, text) => {
    expect(createTranslator("de", { ...CATALOGS, de })("count.tests", { count })).toBe(text);
  });

  test("falls back to English for a key the locale lacks, and says so", () => {
    const partial = { "status.passed": "bestanden" } as unknown as Catalog;
    const missing: string[] = [];
    const t = createTranslator("de", { ...CATALOGS, de: partial }, (key, lang) => missing.push(`${lang}:${key}`));
    expect(t("status.passed")).toBe("bestanden");
    expect(t("status.failed")).toBe("failed");
    expect(missing).toEqual(["de:status.failed"]);
  });
});
