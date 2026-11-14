// Generates the gitleaks redaction rules (MIT) from the pinned gitleaks release. update-deps bumps the version.
// Run: bun scripts/gen-gitleaks.ts
import { $ } from "bun";
import { goToJs } from "./lib/go-regex.ts";

const VERSION = "v8.30.1";
const RAW = `https://raw.githubusercontent.com/gitleaks/gitleaks/${VERSION}`;
const OUT = "packages/ctxray/src/shared/redact/gitleaks-rules.json";

type GoAllowlist = {
  condition?: "OR" | "AND";
  regexTarget?: "secret" | "match" | "line";
  regexes?: string[];
  stopwords?: string[];
  paths?: string[];
};
type GoRule = {
  id: string;
  regex?: string;
  path?: string;
  secretGroup?: number;
  entropy?: number;
  keywords?: string[];
  allowlists?: GoAllowlist[];
};
type GoConfig = { allowlist: GoAllowlist; rules: GoRule[] };

const fetchText = async (path: string) => {
  const response = await fetch(`${RAW}/${path}`);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.text();
};

// Every translated pattern must compile, or the generator stops before writing anything.
const translate = (source: string, where: string) => {
  const js = goToJs(source);
  try {
    new RegExp(js);
  } catch (error) {
    throw new Error(`${where}: ${String(error)}\n  go: ${source}\n  js: ${js}`);
  }
  return js;
};

// ctxray redacts text, not files: a list that needs a path can't hold, so it's dropped (with AND, the whole list).
const allowlistOf = (list: GoAllowlist, where: string) => {
  if (list.paths && list.condition === "AND") return undefined;
  if (!list.regexes && !list.stopwords) return undefined;
  return {
    ...(list.condition === "AND" && { all: true }),
    ...(list.regexTarget && list.regexTarget !== "secret" && { target: list.regexTarget }),
    ...(list.regexes && { regexes: list.regexes.map((regex) => translate(regex, where)) }),
    ...(list.stopwords && { stopwords: list.stopwords }),
  };
};

const config = Bun.TOML.parse(await fetchText("config/gitleaks.toml")) as GoConfig;
const license = await fetchText("LICENSE");

// Rules tied to a file path detect whole files, like keystores, which a trace never holds.
const rules = config.rules
  .filter((rule) => rule.regex !== undefined && rule.path === undefined)
  .map((rule) => {
    const allowlists = (rule.allowlists ?? []).flatMap((list) => allowlistOf(list, rule.id) ?? []);
    return {
      id: rule.id,
      regex: translate(rule.regex as string, rule.id),
      ...(rule.secretGroup && { secretGroup: rule.secretGroup }),
      ...(rule.entropy && { entropy: rule.entropy }),
      ...(rule.keywords && { keywords: rule.keywords.map((keyword) => keyword.toLowerCase()) }),
      ...(allowlists.length > 0 && { allowlists }),
    };
  });

const data = {
  source: `https://github.com/gitleaks/gitleaks/blob/${VERSION}/config/gitleaks.toml`,
  version: VERSION,
  license,
  allowlist: allowlistOf(config.allowlist, "global"),
  rules,
};
await Bun.write(OUT, JSON.stringify(data));
await $`bunx biome format --write ${OUT}`.quiet();
console.log(`${OUT}: ${rules.length} of ${config.rules.length} gitleaks ${VERSION} rules`);
