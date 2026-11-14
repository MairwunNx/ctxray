import { describe, expect, test } from "bun:test";
import type { Values } from "../shared/cli/index.ts";
import { resolveSettings, type SettingsSources } from "./settings.ts";

const base: SettingsSources = { values: {}, env: {}, tty: true, intlLocale: "en-US" };
const settings = (overrides: Partial<SettingsSources>) => resolveSettings({ ...base, ...overrides });

describe("language", () => {
  test.each<[string, Values, Record<string, string>, string]>([
    ["the flag beats the environment", { lang: "en" }, { CTXRAY_LANG: "ru", LANG: "ru_RU.UTF-8" }, "en"],
    ["CTXRAY_LANG beats LANG", {}, { CTXRAY_LANG: "ru", LANG: "en_US.UTF-8" }, "ru"],
    ["LANG works alone", {}, { LANG: "ru_RU.UTF-8" }, "ru"],
    ["an unsupported flag falls back to English", { lang: "de" }, { LANG: "ru_RU.UTF-8" }, "en"],
  ])("%s", (_, values, env, lang) => {
    expect(settings({ values, env }).lang).toBe(lang);
  });

  test.each<[string, Values, Record<string, string>, string, string]>([
    ["the config beats LANG", {}, { LANG: "en_US.UTF-8" }, "ru", "ru"],
    ["CTXRAY_LANG beats the config", {}, { CTXRAY_LANG: "en" }, "ru", "en"],
    ["the flag beats the config", { lang: "en" }, {}, "ru", "en"],
    ["auto in the config defers to LANG", {}, { LANG: "ru_RU.UTF-8" }, "auto", "ru"],
  ])("%s", (_, values, env, configLang, lang) => {
    expect(settings({ values, env, configLang }).lang).toBe(lang);
  });

  test.each<[Values, Record<string, string>, string | undefined]>([
    [{ lang: "de" }, {}, "de"],
    [{}, { CTXRAY_LANG: "fr_FR" }, "fr"],
    [{ lang: "ru" }, {}, undefined],
    [{}, { LANG: "de_DE.UTF-8" }, undefined], // only an explicit request deserves a warning
  ])("%p with %p reports unsupported %p", (values, env, unsupported) => {
    expect(settings({ values, env }).unsupportedLang).toBe(unsupported);
  });

  test("an unsupported config language warns too", () => {
    expect(settings({ configLang: "de" }).unsupportedLang).toBe("de");
  });
});

describe("CI and renderer", () => {
  test.each<[string, Partial<SettingsSources>, boolean, "ink" | "plain"]>([
    ["a terminal", {}, false, "ink"],
    ["--ci", { values: { ci: true } }, true, "plain"],
    ["GITLAB_CI", { env: { GITLAB_CI: "true" } }, true, "plain"],
    ["--plain", { values: { plain: true } }, false, "plain"],
    ["--no-color", { values: { "no-color": true } }, false, "plain"],
    ["NO_COLOR", { env: { NO_COLOR: "1" } }, false, "plain"],
    ["a pipe", { tty: false }, false, "plain"],
  ])("%s", (_, overrides, ci, renderer) => {
    const result = settings(overrides);
    expect([result.ci, result.renderer]).toEqual([ci, renderer]);
  });
});
