import { describe, expect, test } from "bun:test";
import { entropyOf, gitleaksPatterns } from "./gitleaks.ts";
import { createRedactor, marker } from "./redact.ts";

// Glued from parts, so secret scanners never mistake this file for a leak.
const fake = (...parts: string[]) => parts.join("");
// High-entropy filler of an exact length, the same on every run.
const ALPHABET = "q8Rz3KfLw2Xn7Vb5Mc1Yd9Ht4Gs6Pj0Ae";
const random = (length: number) =>
  Array.from({ length }, (_, i) => ALPHABET[(i * 7 + (i >> 3)) % ALPHABET.length]).join("");
const redactor = createRedactor();

describe("gitleaks rules", () => {
  test("all of them compile and know their keywords", () => {
    const patterns = gitleaksPatterns();
    expect(patterns.length).toBeGreaterThan(200);
    expect(patterns.filter((pattern) => !pattern.keywords).map((pattern) => pattern.id)).toEqual([]);
  });

  test.each([
    ["doppler-api-token", fake("dp.pt.", random(43))],
    ["linear-api-key", fake("lin_api_", random(40))],
    ["sendgrid-api-token", fake("SG.", random(66))],
    ["hashicorp-tf-api-token", fake(random(14), ".atlasv1.", random(64))],
  ])("%s", (id, secret) => {
    expect(redactor.text(`value ${secret} end`)).toBe(`value ${marker(id)} end`);
  });

  test("generic-api-key takes only the secret, not its name", () => {
    const secret = fake("Zx8", "Qw3Er5Ty7Ui9Op1As2Df4");
    expect(redactor.text(`deploy_token = "${secret}"`)).toBe(`deploy_token = "${marker("generic-api-key")}"`);
  });

  test.each([
    ["a low-entropy value", 'api_key = "aaaaaaaaaaaaaaaa"'],
    ["a stopword", 'secret_name = "payment-gateway-prod"'],
    ["a placeholder", fake("token: $", "{GITHUB_TOKEN}")],
    ["prose", "Run the tests with bun and keep secrets out of logs."],
  ])("keeps %s", (_, text) => {
    expect(redactor.text(text)).toBe(text);
  });

  test("stays fast on a long payload", () => {
    const prose = "You are an agent. Use the Read tool to read files, then answer the user. ".repeat(2000);
    const started = performance.now();
    redactor.text(prose);
    expect(performance.now() - started).toBeLessThan(500);
  });
});

describe("entropyOf", () => {
  test.each([
    ["aaaa", 0],
    ["abab", 1],
    ["abcd", 2],
  ])("%s", (text, bits) => {
    expect(entropyOf(text)).toBeCloseTo(bits);
  });
});
