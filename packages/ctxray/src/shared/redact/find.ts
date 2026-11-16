import type { Redactor } from "./redact.ts";

// What a secret or a piece of personal data is, by the pattern that caught it, and the line it sits on.
// The value itself never leaves: a finding names the kind only.
export type Sighting = { kind: string; line: number };

const MARKER = /⟦redacted:([\w-]+)⟧/g;
// A secret field written out in a config, `"apiKey": "…"` or `token = "…"`. A reference like ${TOKEN},
// $TOKEN, or {env:TOKEN} names a variable, so it stays quiet.
const FIELD =
  /["']?((?:authorization|password|passwd|client[-_]?secret|[\w-]*api[-_]?key|[\w-]*token|[\w-]*secret))["']?\s*[:=]\s*["']([^"'\s]{8,})["']/i;
const REFERENCE = /^(?:\$\{?[\w.-]+\}?|\{env:[\w.-]+\}|<[^>]*>|x{3,}|\*{3,}|\.{3})$/i;

export const findSecrets = (redactor: Redactor, text: string): Sighting[] => {
  const lines = text.split("\n");
  const sightings = lines.flatMap((line, index) => {
    const kinds = [...redactor.text(line).matchAll(MARKER)].map((match) => match[1] ?? "secret");
    const field = FIELD.exec(line);
    if (kinds.length === 0 && field?.[2] !== undefined && !REFERENCE.test(field[2])) kinds.push("secret-field");
    return [...new Set(kinds)].map((kind) => ({ kind, line: index + 1 }));
  });
  // A private key spans lines, so only the whole text matches it: the finding points at its first line.
  const begin = lines.findIndex((line) => /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(line));
  if (begin !== -1 && redactor.text(text).includes("⟦redacted:private-key⟧")) {
    sightings.push({ kind: "private-key", line: begin + 1 });
  }
  return sightings;
};
