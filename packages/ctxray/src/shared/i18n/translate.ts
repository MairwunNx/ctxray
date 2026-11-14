import type { Message } from "./catalog.ts";
import type { Catalog, MessageKey } from "./catalog-type.ts";
import { CATALOGS, DEFAULT_LANG } from "./locales/index.ts";

export type Params = Readonly<Record<string, string | number>>;
export type Translate = (key: MessageKey, params?: Params) => string;
export type OnMissing = (key: string, lang: string) => void;

const pick = (message: Message, rules: Intl.PluralRules, count: number | undefined): string => {
  if (typeof message === "string") return message;
  return (count === undefined ? undefined : message[rules.select(count)]) ?? message.other;
};

// `count` picks the plural form. Numbers are formatted for the locale, so 12345 reads “12,345” or «12 345».
export const createTranslator = (
  lang: string,
  catalogs: Readonly<Record<string, Catalog>> = CATALOGS,
  onMissing: OnMissing = () => {},
): Translate => {
  const rules = new Intl.PluralRules(lang);
  const numbers = new Intl.NumberFormat(lang);
  const own = catalogs[lang];
  const fallback = catalogs[DEFAULT_LANG];

  return (key, params = {}) => {
    const local = own?.[key];
    if (local === undefined) onMissing(key, lang);
    const message = local ?? fallback?.[key];
    if (message === undefined) return key;
    const count = typeof params["count"] === "number" ? params["count"] : undefined;
    return pick(message, rules, count).replace(/\{(\w+)\}/g, (placeholder, name: string) => {
      const value = params[name];
      if (value === undefined) return placeholder;
      return typeof value === "number" ? numbers.format(value) : value;
    });
  };
};
