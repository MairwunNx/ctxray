import { expect, test } from "bun:test";
import type { OptionSpecs } from "./command.ts";
import { type Parsed, parseFlags } from "./parse.ts";

const specs: OptionSpecs = {
  lang: { type: "string", summary: "option.lang" },
  ci: { type: "boolean", summary: "option.ci" },
  help: { type: "boolean", short: "h", summary: "option.help" },
};

const ok = (values: Record<string, string | boolean>, positionals: string[] = []): Parsed => ({
  ok: true,
  values,
  positionals,
});
const error = (kind: "unknownOption" | "missingValue" | "unexpectedValue", option: string): Parsed => ({
  ok: false,
  error: { kind, option },
});

test.each<[string[], Parsed]>([
  [[], ok({})],
  [["init"], ok({}, ["init"])],
  [["--lang", "ru", "init"], ok({ lang: "ru" }, ["init"])],
  [["init", "--lang=ru", "--ci"], ok({ lang: "ru", ci: true }, ["init"])],
  [["-h"], ok({ help: true })],
  [["--", "--ci"], ok({}, ["--ci"])],
  [["--lang=-x"], ok({ lang: "-x" })],
  [["--force"], error("unknownOption", "--force")],
  [["-x"], error("unknownOption", "-x")],
  [["--lang"], error("missingValue", "--lang")],
  [["--lang", "--ci"], error("missingValue", "--lang")],
  [["--ci=yes"], error("unexpectedValue", "--ci")],
])("%p parses to %p", (args, expected) => {
  expect(parseFlags(args, specs)).toEqual(expected);
});
