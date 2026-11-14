import { parseArgs } from "node:util";
import type { OptionSpecs, Values } from "./command.ts";

export type ParseError = {
  readonly kind: "unknownOption" | "missingValue" | "unexpectedValue";
  readonly option: string; // as typed: `--lang`, `-x`
};
export type Parsed =
  | { readonly ok: true; readonly values: Values; readonly positionals: readonly string[] }
  | { readonly ok: false; readonly error: ParseError };

const fail = (kind: ParseError["kind"], option: string): Parsed => ({ ok: false, error: { kind, option } });

// node:util parses, ctxray judges: strict mode would throw English messages, these errors get translated.
export const parseFlags = (args: readonly string[], specs: OptionSpecs): Parsed => {
  const { tokens } = parseArgs({
    args: [...args],
    options: Object.fromEntries(
      Object.entries(specs).map(([name, spec]) => [name, spec.short ? { type: spec.type, short: spec.short } : spec]),
    ),
    strict: false,
    allowPositionals: true,
    tokens: true,
  });
  const values: Record<string, string | boolean> = {};
  const positionals: string[] = [];
  for (const token of tokens) {
    if (token.kind === "positional") positionals.push(token.value);
    if (token.kind !== "option") continue;
    const spec = specs[token.name];
    if (!spec) return fail("unknownOption", token.rawName);
    if (spec.type === "boolean") {
      if (token.value !== undefined) return fail("unexpectedValue", token.rawName);
      values[token.name] = true;
      continue;
    }
    // `--lang --ci` would otherwise read “--ci” as the language.
    if (token.value === undefined || (!token.inlineValue && token.value.startsWith("-"))) {
      return fail("missingValue", token.rawName);
    }
    values[token.name] = token.value;
  }
  return { ok: true, values, positionals };
};
