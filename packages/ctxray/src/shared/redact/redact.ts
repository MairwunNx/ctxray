import { BUILTIN_PATTERNS, type Pattern } from "./patterns.ts";

export type Redactor = {
  text: (value: string) => string;
  value: <T>(value: T) => T;
};

// Header and field names whose whole value is a secret, whatever it looks like.
const SECRET_KEYS =
  /^(?:authorization|proxy-authorization|cookie|set-cookie|password|passwd|client[-_]secret|[\w-]*api[-_]key)$/i;

export const marker = (id: string) => `⟦redacted:${id}⟧`;

const global = (regex: RegExp) => (regex.global ? regex : new RegExp(regex.source, `${regex.flags}g`));

// Built-in patterns always run, and the configured ones come after them.
export const createRedactor = (extra: readonly RegExp[] = []): Redactor => {
  const patterns: Pattern[] = [...BUILTIN_PATTERNS, ...extra.map((regex) => ({ id: "custom", regex: global(regex) }))];

  const text = (value: string) =>
    patterns.reduce(
      (current, { id, regex, accept }) =>
        current.replace(regex, (match) => (accept && !accept(match) ? match : marker(id))),
      value,
    );

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
