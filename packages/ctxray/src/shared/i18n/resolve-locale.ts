import { DEFAULT_LANG } from "./locales/index.ts";

export type LocaleSources = {
  flag?: string | undefined; // --lang
  env: Readonly<Record<string, string | undefined>>; // CTXRAY_LANG, LC_ALL, LC_MESSAGES, LANG
  config?: string | undefined; // `lang` in ctxray.config.ts
  windowsUiLocale?: string | undefined; // the system UI language on Windows
  intlLocale?: string | undefined; // Intl.DateTimeFormat().resolvedOptions().locale
};

// `ru_RU.UTF-8`, `ru-RU`, and `RU` all mean `ru`. `C`, `POSIX`, empty values, and `auto` mean “not set”.
export const languageOf = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.toLowerCase() === "auto") return undefined;
  const base = trimmed.split(/[_.@-]/)[0]?.toLowerCase();
  if (!base || base === "c" || base === "posix") return undefined;
  return /^[a-z]{2,3}$/.test(base) ? base : undefined;
};

// The first source that names a language wins. A language without a catalog falls back to English
// rather than to the next source, so `--lang de` never turns into Russian because LANG says so.
export const resolveLocale = (sources: LocaleSources, supported: readonly string[]): string => {
  const { env } = sources;
  const candidates = [
    sources.flag,
    env["CTXRAY_LANG"],
    sources.config,
    env["LC_ALL"],
    env["LC_MESSAGES"],
    env["LANG"],
    sources.windowsUiLocale,
    sources.intlLocale,
  ];
  for (const candidate of candidates) {
    const lang = languageOf(candidate);
    if (lang) return supported.includes(lang) ? lang : DEFAULT_LANG;
  }
  return DEFAULT_LANG;
};
