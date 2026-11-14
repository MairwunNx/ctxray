import { passesLuhn } from "./luhn.ts";

// One match of a pattern, with where it sits in the text it came from.
export type Found = { match: string; groups: readonly (string | undefined)[]; offset: number; text: string };

export type Pattern = {
  id: string;
  regex: RegExp; // global
  accept?: (match: string) => boolean;
  keywords?: readonly string[]; // lower case: the pattern runs only on text that holds one of them
  secret?: (found: Found) => string | undefined; // the part of the match to redact, undefined keeps it all
};

const card = (match: string) => {
  const digits = match.replace(/\D/g, "");
  return digits.length >= 13 && digits.length <= 19 && passesLuhn(digits);
};

// Order matters: specific formats go before the generic ones that would swallow them (sk-ant- before sk-).
export const BUILTIN_PATTERNS: readonly Pattern[] = [
  { id: "private-key", regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
  { id: "jwt", regex: /\beyJ[\w-]{8,}\.eyJ[\w-]{8,}\.[\w-]{8,}/g },
  { id: "anthropic-key", regex: /\bsk-ant-[\w-]{20,}/g },
  { id: "openai-key", regex: /\bsk-(?:proj-|svcacct-|admin-)?[\w-]{20,}/g },
  { id: "stripe-key", regex: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/g },
  { id: "google-api-key", regex: /\bAIza[\w-]{35}/g },
  { id: "github-token", regex: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_\w{60,})/g },
  { id: "gitlab-token", regex: /\bglpat-[\w-]{20,}/g },
  { id: "npm-token", regex: /\bnpm_[A-Za-z0-9]{36}\b/g },
  { id: "aws-access-key", regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { id: "slack-token", regex: /\bxox[abposr]-[A-Za-z0-9-]{10,}/g },
  { id: "telegram-bot-token", regex: /\b\d{8,10}:[\w-]{35}\b/g },
  { id: "bearer", regex: /\bBearer\s+[\w.~+/=-]{16,}/g },
  // `user:password@` in a proxy or registry URL. It runs before email, which would take only the password.
  { id: "url-credentials", regex: /(?<=\b[a-z][\w+.-]*:\/\/)[^\s/@:]+:[^\s/@]+(?=@)/gi },
  { id: "email", regex: /\b[\w.%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  // Only with a country code or Russia's 8 (XXX), so versions, ids, and timestamps never match.
  { id: "phone", regex: /(?<![\w.+])\+\d{1,3}[\s-]?\(?\d{2,4}\)?(?:[\s-]?\d{2,4}){2,3}(?![\w.])/g },
  { id: "phone", regex: /(?<![\w.])8[\s-]?\(\d{3}\)[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}(?![\w.])/g },
  { id: "card", regex: /(?<![\w.])[2-6]\d{3}(?:[ -]?\d{2,4}){2,4}(?![\w.])/g, accept: card },
];
