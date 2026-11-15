type Message = string | Partial<Record<Intl.LDMLPluralRule, string>>;
export type Catalogs = Record<string, Record<string, Message>>;
export type Params = Record<string, string | number | readonly string[]>;

// The CLI's translator, in the browser: plural forms by Intl.PluralRules, numbers and lists in the locale.
export const translator = (catalogs: Catalogs, lang: string) => {
  const own = catalogs[lang] ?? {};
  const fallback = catalogs["en"] ?? {};
  const rules = new Intl.PluralRules(lang);
  const numbers = new Intl.NumberFormat(lang);
  const lists = new Intl.ListFormat(lang, { type: "conjunction" });
  return (key: string, params: Params = {}): string => {
    const message = own[key] ?? fallback[key];
    if (message === undefined) return key;
    const count = typeof params["count"] === "number" ? params["count"] : undefined;
    const text =
      typeof message === "string"
        ? message
        : ((count === undefined ? undefined : message[rules.select(count)]) ?? message.other ?? key);
    return text.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
      const value = params[name];
      if (value === undefined) return placeholder;
      if (typeof value === "number") return numbers.format(value);
      return typeof value === "string" ? value : lists.format(value);
    });
  };
};
export type Translate = ReturnType<typeof translator>;
