import data from "./gitleaks-rules.json" with { type: "json" };
import type { Found, Pattern } from "./patterns.ts";

// The gitleaks rules as scripts/gen-gitleaks.ts wrote them: already in JavaScript syntax.
type Allowlist = { all?: boolean; target?: string; regexes?: string[]; stopwords?: string[] };
type Rule = { id: string; regex: string; secretGroup?: number; entropy?: number; keywords?: string[] };

// Shannon entropy in bits per character: random keys score high, words and placeholders low.
export const entropyOf = (text: string): number => {
  const counts = new Map<string, number>();
  for (const char of text) counts.set(char, (counts.get(char) ?? 0) + 1);
  let bits = 0;
  for (const count of counts.values()) {
    const share = count / text.length;
    bits -= share * Math.log2(share);
  }
  return bits;
};

const lineAround = (text: string, offset: number) => {
  const start = text.lastIndexOf("\n", offset) + 1;
  const end = text.indexOf("\n", offset);
  return text.slice(start, end === -1 ? text.length : end);
};

const compileAllowlist = (list: Allowlist) => {
  const regexes = (list.regexes ?? []).map((source) => new RegExp(source));
  const stopwords = list.stopwords ?? [];
  return (found: Found, secret: string): boolean => {
    const target =
      list.target === "match" ? found.match : list.target === "line" ? lineAround(found.text, found.offset) : secret;
    const byRegex = regexes.length > 0 && regexes.some((regex) => regex.test(target));
    const lower = secret.toLowerCase();
    const byStopword = stopwords.length > 0 && stopwords.some((word) => lower.includes(word));
    return list.all ? byRegex && byStopword : byRegex || byStopword;
  };
};

const GLOBAL_ALLOW = data.allowlist ? [compileAllowlist(data.allowlist)] : [];

// The secret is the rule's group, else the first group that matched, else the whole match, as in gitleaks.
const secretOf = (found: Found, group: number | undefined) =>
  (group === undefined ? found.groups.find((value) => value !== undefined) : found.groups[group - 1]) ?? found.match;

const compile = (rule: Rule & { allowlists?: Allowlist[] }): Pattern => {
  const allow = [...GLOBAL_ALLOW, ...(rule.allowlists ?? []).map(compileAllowlist)];
  return {
    id: rule.id,
    regex: new RegExp(rule.regex, "g"),
    ...(rule.keywords && { keywords: rule.keywords }),
    secret: (found) => {
      const secret = secretOf(found, rule.secretGroup);
      if (rule.entropy !== undefined && entropyOf(secret) < rule.entropy) return undefined;
      return allow.some((allowed) => allowed(found, secret)) ? undefined : secret;
    },
  };
};

let compiled: readonly Pattern[] | undefined;

// Compiled on first use: two hundred regular expressions cost a few milliseconds a command may never need.
export const gitleaksPatterns = (): readonly Pattern[] => {
  compiled ??= (data.rules as (Rule & { allowlists?: Allowlist[] })[]).map(compile);
  return compiled;
};

export const GITLEAKS_VERSION = data.version;
