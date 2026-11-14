import { gitleaksPatterns } from "./gitleaks.ts";
import { BUILTIN_PATTERNS, type Found, type Pattern } from "./patterns.ts";

export type Redactor = {
  text: (value: string) => string;
  value: <T>(value: T) => T;
};

// Header and field names whose whole value is a secret, whatever it looks like.
const SECRET_KEYS =
  /^(?:authorization|proxy-authorization|cookie|set-cookie|password|passwd|client[-_]secret|[\w-]*api[-_]key)$/i;

export const marker = (id: string) => `⟦redacted:${id}⟧`;

const global = (regex: RegExp) => (regex.global ? regex : new RegExp(regex.source, `${regex.flags}g`));

// A replace() callback gets the groups, then the offset, the text, and named groups when the regex has any.
const foundOf = (args: unknown[]): Found => {
  const tail = typeof args.at(-1) === "object" ? args.slice(0, -1) : args;
  return {
    match: tail[0] as string,
    groups: tail.slice(1, -2) as (string | undefined)[],
    offset: tail.at(-2) as number,
    text: tail.at(-1) as string,
  };
};

const apply = (text: string, pattern: Pattern) => {
  const { id, regex, accept, keywords, secret } = pattern;
  if (keywords && !keywords.some((keyword) => text.toLowerCase().includes(keyword))) return text;
  return text.replace(regex, (...args: unknown[]) => {
    const found = foundOf(args);
    if (accept && !accept(found.match)) return found.match;
    if (!secret) return marker(id);
    const part = secret(found);
    return part === undefined ? found.match : found.match.replace(part, marker(id));
  });
};

// ctxray's own patterns run first, then the gitleaks rules, then the configured ones.
export const createRedactor = (extra: readonly RegExp[] = []): Redactor => {
  const patterns: Pattern[] = [
    ...BUILTIN_PATTERNS,
    ...gitleaksPatterns(),
    ...extra.map((regex) => ({ id: "custom", regex: global(regex) })),
  ];

  const text = (value: string) => patterns.reduce(apply, value);

  const walk = (value: unknown): unknown => {
    if (typeof value === "string") return text(value);
    if (Array.isArray(value)) return value.map(walk);
    if (value === null || typeof value !== "object") return value;
    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [key, SECRET_KEYS.test(key) ? marker("secret-field") : walk(inner)]),
    );
  };

  return { text, value: <T>(value: T) => walk(value) as T };
};
