import { describe, expect, test } from "bun:test";
import { createRedactor, marker } from "./redact.ts";

// Fake secrets are glued from parts, so secret scanners never mistake this file for a leak.
const fake = (...parts: string[]) => parts.join("");
const run = (n: number, chars = "aB3dE5gH7j") => chars.repeat(Math.ceil(n / chars.length)).slice(0, n);
const redactor = createRedactor();

describe("built-in patterns redact", () => {
  test.each([
    ["private-key", fake("-----BEGIN ", "RSA PRIVATE KEY-----\nMIIEow\nIBAAK\n-----END RSA ", "PRIVATE KEY-----")],
    ["private-key", fake("-----BEGIN ", "OPENSSH PRIVATE KEY-----\nb3Blbn\n-----END OPENSSH ", "PRIVATE KEY-----")],
    ["jwt", fake("eyJ", "hbGciOiJIUzI1NiJ9", ".", "eyJ", "zdWIiOiIxMjM0In0", ".", "SflKxwRJSMeKKF2QT4fw")],
    ["anthropic-key", fake("sk-", "ant-", "api03-", run(40))],
    ["openai-key", fake("sk-", "proj-", run(48))],
    ["openai-key", fake("sk-", run(48))],
    ["stripe-key", fake("sk_", "live_", run(24))],
    ["google-api-key", fake("AI", "za", run(35))],
    ["github-token", fake("gh", "p_", run(36))],
    ["github-token", fake("gh", "o_", run(36))],
    ["github-token", fake("github_", "pat_", run(82))],
    ["gitlab-token", fake("gl", "pat-", run(20))],
    ["npm-token", fake("np", "m_", run(36))],
    ["aws-access-key", fake("AK", "IA", "IOSFODNN7EXAMPLE")],
    ["slack-token", fake("xo", "xb-", "1234567890-", run(24))],
    ["telegram-bot-token", fake("123456789", ":", run(35))],
    ["bearer", fake("Bearer ", run(32))],
    ["email", "pavel.erokhin+ctx@example.co.uk"],
    ["phone", "+7 912 345-67-89"],
    ["phone", "+1 (415) 555-0132"],
    ["phone", "+44 20 7946 0958"],
    ["phone", "8 (912) 345-67-89"],
    ["card", "4111 1111 1111 1111"],
    ["card", "5500-0000-0000-0004"],
    ["card", "378282246310005"],
  ])("%s: %j", (id, secret) => {
    expect(redactor.text(`before ${secret} after`)).toBe(`before ${marker(id)} after`);
  });
});

describe("URL credentials", () => {
  test.each([
    ["http://ivan:s3cr3t@proxy.corp.test:3128", `http://${marker("url-credentials")}@proxy.corp.test:3128`],
    ["https://bot:tok%2Fen@registry.corp.test/", `https://${marker("url-credentials")}@registry.corp.test/`],
  ])("%s keeps the host", (url, expected) => {
    expect(redactor.text(url)).toBe(expected);
  });

  test("a URL without credentials stays", () => {
    expect(redactor.text("http://proxy.corp.test:3128/path?a=b:c")).toBe("http://proxy.corp.test:3128/path?a=b:c");
  });
});

describe("leaves alone", () => {
  test.each([
    ["a version", "claude-code 2.1.325, bun 1.4.4"],
    ["a date and time", "2026-11-14T16:35:34.058Z"],
    ["a token count", "tokens.total 27104 > 25000"],
    ["a number failing Luhn", "order 4111 1111 1111 1112"],
    ["a long id that is no card", "build 1234567890123456"],
    ["an npm scope", 'import { z } from "@types/node"'],
    ["a canary marker", "⟦ctx:rules/kotlin.md⟧"],
    ["a short sk- word", "sk-learn and sk-ant are names"],
    ["a phone without country code", "call 912 345 67 89"],
    ["a path", "app/src/main/kotlin/payments/AGENTS.md"],
    ["a git commit hash", "eacade1 6dfa30c 96fea7b"],
  ])("%s", (_, text) => {
    expect(redactor.text(text)).toBe(text);
  });
});

describe("value", () => {
  test("walks objects and arrays, and blanks secret fields whatever they hold", () => {
    const request = {
      headers: { Authorization: "Basic dXNlcjpwYXNz", "x-api-key": "anything", "content-type": "application/json" },
      body: { messages: [{ role: "user", content: "mail me at a@b.io" }], max_tokens: 32000 },
    };
    expect(redactor.value(request)).toEqual({
      headers: {
        Authorization: marker("secret-field"),
        "x-api-key": marker("secret-field"),
        "content-type": "application/json",
      },
      body: { messages: [{ role: "user", content: `mail me at ${marker("email")}` }], max_tokens: 32000 },
    });
  });

  test("never mutates its input", () => {
    const input = { text: "a@b.io" };
    redactor.value(input);
    expect(input.text).toBe("a@b.io");
  });
});

describe("configured patterns", () => {
  test.each([
    [/INTERNAL-\d{6}/, "ticket INTERNAL-123456 done", `ticket ${marker("custom")} done`],
    [/corp\.example/g, "corp.example and corp.example", `${marker("custom")} and ${marker("custom")}`],
  ])("%s", (pattern, input, output) => {
    expect(createRedactor([pattern]).text(input)).toBe(output);
  });

  test("run after the built-in ones", () => {
    expect(createRedactor([/a@b/]).text("a@b.io")).toBe(marker("email"));
  });
});
