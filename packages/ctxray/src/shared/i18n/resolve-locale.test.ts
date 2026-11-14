import { describe, expect, test } from "bun:test";
import { type LocaleSources, languageOf, resolveLocale } from "./resolve-locale.ts";

const SUPPORTED = ["en", "ru"];

describe("languageOf", () => {
  test.each([
    ["ru_RU.UTF-8", "ru"],
    ["ru-RU", "ru"],
    ["RU", "ru"],
    ["en_US", "en"],
    ["de_DE@euro", "de"],
    ["pt_BR.utf8", "pt"],
    ["fil_PH", "fil"],
    ["C", undefined],
    ["C.UTF-8", undefined],
    ["POSIX", undefined],
    ["auto", undefined],
    ["", undefined],
    ["   ", undefined],
    ["1234", undefined],
    [undefined, undefined],
  ])("%p → %p", (value, lang) => {
    expect(languageOf(value)).toBe(lang);
  });
});

describe("resolveLocale", () => {
  const env = (vars: Record<string, string>) => vars;

  test.each<[string, LocaleSources, string]>([
    ["the flag beats everything", { flag: "ru", env: env({ CTXRAY_LANG: "en", LANG: "en_US.UTF-8" }) }, "ru"],
    ["CTXRAY_LANG beats the config", { env: env({ CTXRAY_LANG: "ru" }), config: "en" }, "ru"],
    ["the config beats POSIX variables", { env: env({ LANG: "ru_RU.UTF-8" }), config: "en" }, "en"],
    ["config `auto` defers to POSIX", { env: env({ LANG: "ru_RU.UTF-8" }), config: "auto" }, "ru"],
    ["flag `auto` defers too", { flag: "auto", env: env({ CTXRAY_LANG: "ru" }) }, "ru"],
    ["LC_ALL beats LC_MESSAGES", { env: env({ LC_ALL: "ru_RU.UTF-8", LC_MESSAGES: "en_US.UTF-8" }) }, "ru"],
    ["LC_MESSAGES beats LANG", { env: env({ LC_MESSAGES: "ru_RU.UTF-8", LANG: "en_US.UTF-8" }) }, "ru"],
    ["LANG alone", { env: env({ LANG: "ru_RU.UTF-8" }) }, "ru"],
    ["C is skipped", { env: env({ LC_ALL: "C", LANG: "ru_RU.UTF-8" }) }, "ru"],
    ["POSIX is skipped", { env: env({ LC_ALL: "POSIX", LC_MESSAGES: "ru_RU" }) }, "ru"],
    ["POSIX beats Windows", { env: env({ LANG: "en_US.UTF-8" }), windowsUiLocale: "ru-RU" }, "en"],
    ["Windows beats Intl", { env: env({}), windowsUiLocale: "ru-RU", intlLocale: "en-US" }, "ru"],
    ["Intl when nothing else", { env: env({}), intlLocale: "ru-RU" }, "ru"],
    ["English when nothing at all", { env: env({}) }, "en"],
    ["an unsupported flag falls back to English", { flag: "de", env: env({ LANG: "ru_RU.UTF-8" }) }, "en"],
    ["an unsupported LANG falls back to English", { env: env({ LANG: "fr_FR.UTF-8" }), intlLocale: "ru" }, "en"],
    ["a garbage flag is skipped", { flag: "", env: env({ CTXRAY_LANG: "ru" }) }, "ru"],
  ])("%s", (_, sources, expected) => {
    expect(resolveLocale(sources, SUPPORTED)).toBe(expected);
  });
});
