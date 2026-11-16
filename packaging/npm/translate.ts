import { CATALOGS, createTranslator, resolveLocale } from "#ctxray/shared/i18n/index.ts";

// The npm package speaks the language the binary would: CTXRAY_LANG, then the POSIX variables, then the system's.
export const t = createTranslator(
  resolveLocale(
    { env: process.env, intlLocale: Intl.DateTimeFormat().resolvedOptions().locale },
    Object.keys(CATALOGS),
  ),
);
