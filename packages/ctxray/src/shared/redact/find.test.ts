import { expect, test } from "bun:test";
import { findSecrets } from "./find.ts";
import { createRedactor } from "./redact.ts";

const redactor = createRedactor();
const token = ["ghp", "_", "A".repeat(36)].join("");

test.each<[string, string, { kind: string; line: number }[]]>([
  ["a token in prose", `# Notes\n\nUse ${token} for the API.\n`, [{ kind: "github-token", line: 3 }]],
  ["an email", "Ask anna.ivanova@corp.test before merging.\n", [{ kind: "email", line: 1 }]],
  [
    "a secret field in a config",
    '{\n  "env": { "DB_PASSWORD": "hunter2hunter2" }\n}\n',
    [{ kind: "secret-field", line: 2 }],
  ],
  ["a secret field in TOML", 'api_key = "Zr8kQ2mW7xV4pL9n"\n', [{ kind: "generic-api-key", line: 1 }]],
  [
    "a private key, at its first line",
    "a\n-----BEGIN RSA PRIVATE KEY-----\nMIIE\n-----END RSA PRIVATE KEY-----\n",
    [{ kind: "private-key", line: 2 }],
  ],
  // References name a variable, so they stay quiet.
  ["a variable", '{ "env": { "API_KEY": "${API_KEY}", "TOKEN": "{env:TOKEN}" } }\n', []],
  ["plain text", "Run the tests with bun test before you push.\n", []],
])("%s", (_, text, expected) => {
  expect(findSecrets(redactor, text)).toEqual(expected);
});
