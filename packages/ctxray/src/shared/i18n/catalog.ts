// A message is a template with `{name}` placeholders, or one template per plural category of the locale
// (`Intl.PluralRules`): English needs one and other, Russian one, few, many, and other.
export type Plural = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };
export type Message = string | Plural;

export type CatalogShape<Source extends Record<string, Message>> = {
  readonly [Key in keyof Source]: Source[Key] extends string ? string : Plural;
};
