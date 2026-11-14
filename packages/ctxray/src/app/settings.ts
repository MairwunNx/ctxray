import type { Values } from "../shared/cli/index.ts";
import { CATALOGS, languageOf, resolveLocale } from "../shared/i18n/index.ts";
import { type Env, isCi } from "../shared/infra/index.ts";
import { chooseRenderer, type RendererKind } from "../shared/render/index.ts";

export type Settings = {
  readonly lang: string;
  readonly ci: boolean;
  readonly renderer: RendererKind;
  readonly unsupportedLang: string | undefined; // asked for by --lang or CTXRAY_LANG, but without a catalog
};

export type SettingsSources = {
  values: Values;
  env: Env;
  tty: boolean;
  intlLocale?: string | undefined;
};

const text = (value: string | boolean | undefined) => (typeof value === "string" ? value : undefined);

// A flag beats the environment. The config file joins between the two once ctxray.config.ts loads.
export const resolveSettings = ({ values, env, tty, intlLocale }: SettingsSources): Settings => {
  const supported = Object.keys(CATALOGS);
  const flag = text(values["lang"]);
  const requested = languageOf(flag ?? env["CTXRAY_LANG"]);
  const ci = values["ci"] === true || isCi(env);
  const plain = values["plain"] === true || values["no-color"] === true;
  return {
    lang: resolveLocale({ flag, env, intlLocale }, supported),
    ci,
    renderer: chooseRenderer({ tty, ci, plain, env }),
    unsupportedLang: requested && !supported.includes(requested) ? requested : undefined,
  };
};
