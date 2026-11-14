import type { Values } from "#shared/cli/index.ts";
import { CATALOGS, languageOf, resolveLocale } from "#shared/i18n/index.ts";
import { type Env, isCi } from "#shared/infra/index.ts";
import { chooseRenderer, type RendererKind } from "#shared/render/index.ts";

export type Settings = {
  readonly lang: string;
  readonly ci: boolean;
  readonly renderer: RendererKind;
  readonly unsupportedLang: string | undefined; // asked for by --lang, CTXRAY_LANG, or the config, but without a catalog
};

export type SettingsSources = {
  values: Values;
  env: Env;
  tty: boolean;
  intlLocale?: string | undefined;
  configLang?: string | undefined; // `lang` from the config, once a command has loaded it
};

const text = (value: string | boolean | undefined) => (typeof value === "string" ? value : undefined);

// A flag beats CTXRAY_LANG, which beats the config, which beats the system locale.
export const resolveSettings = ({ values, env, tty, intlLocale, configLang }: SettingsSources): Settings => {
  const supported = Object.keys(CATALOGS);
  const flag = text(values["lang"]);
  const requested = [flag, env["CTXRAY_LANG"], configLang].map(languageOf).find((lang) => lang !== undefined);
  const ci = values["ci"] === true || isCi(env);
  // JSON is for programs, so it never goes through the live view.
  const plain = values["plain"] === true || values["no-color"] === true || values["json"] === true;
  return {
    lang: resolveLocale({ flag, env, config: configLang, intlLocale }, supported),
    ci,
    renderer: chooseRenderer({ tty, ci, plain, env }),
    unsupportedLang: requested && !supported.includes(requested) ? requested : undefined,
  };
};
