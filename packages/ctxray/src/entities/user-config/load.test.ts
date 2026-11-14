import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createConfigLoader } from "./load.ts";

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

const project = (files: Record<string, string>) => {
  const root = mkdtempSync(join(tmpdir(), "ctxray-config-"));
  roots.push(root);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
};

const load = (files: Record<string, string>, { path, lang = "en", env = {} } = {} as Options) =>
  createConfigLoader(project(files), env)(path, lang);
type Options = { path?: string; lang?: string; env?: Record<string, string> };

const ORG_PACKAGE = {
  "node_modules/@rwb/ctxray-config/package.json": JSON.stringify({ name: "@rwb/ctxray-config", main: "index.ts" }),
  "node_modules/@rwb/ctxray-config/index.ts": `export default {
    harnesses: { "claude-code": { version: "2.x" }, codex: {} },
    network: { ca: ["certs/corp.pem"] },
    policies: [{ id: "mcp-budget", maxTokens: { mcp: 10000 } }],
    redact: { patterns: [/ORG-\\d+/] },
  };`,
  "node_modules/@rwb/ctxray-config/certs/corp.pem": "-----BEGIN CERTIFICATE-----\n",
};

describe("createConfigLoader", () => {
  test("without a config file the defaults apply", async () => {
    expect(await load({})).toMatchObject({ ok: true, config: { files: [], reporters: ["console"], lang: "auto" } });
  });

  test("reads ctxray.config.ts", async () => {
    const result = await load({ "ctxray.config.ts": `export default { harnesses: { codex: {} }, lang: "ru" };` });
    expect(result).toMatchObject({ ok: true, config: { files: ["ctxray.config.ts"], harnesses: { codex: {} } } });
  });

  test("reads JSONC with comments, trailing commas, and $schema", async () => {
    const jsonc = `{
      "$schema": "https://github.com/MairwunNx/ctxray/releases/latest/download/config.schema.json",
      // the gateway every real run goes through
      "upstream": "https://gw.corp.test",
      "redact": { "patterns": ["CORP-\\\\d{6}"] },
    }`;
    const result = await load({ "ctxray.config.jsonc": jsonc });
    if (!result.ok) throw new Error(JSON.stringify(result.problems));
    expect(result.config.upstream).toBe("https://gw.corp.test");
    expect(result.config.redact.patterns).toEqual([/CORP-\d{6}/]);
  });

  test("merges an npm package and a relative file, in order", async () => {
    const result = await load({
      ...ORG_PACKAGE,
      "configs/team.jsonc": `{ "harnesses": { "codex": false }, "policies": [{ "id": "mcp-budget", "severity": "warning" }] }`,
      "ctxray.config.ts": `export default {
        extends: ["@rwb/ctxray-config", "./configs/team.jsonc"],
        harnesses: { "claude-code": { model: "opus" } },
        redact: { patterns: [/TEAM-\\d+/] },
      };`,
    });
    if (!result.ok) throw new Error(JSON.stringify(result.problems));
    const { config } = result;
    expect(config.files).toEqual([
      "node_modules/@rwb/ctxray-config/index.ts",
      "configs/team.jsonc",
      "ctxray.config.ts",
    ]);
    expect(config.harnesses).toEqual({ "claude-code": { version: "2.x", model: "opus" } });
    expect(config.policies).toEqual([{ id: "mcp-budget", severity: "warning", maxTokens: { mcp: 10000 } }]);
    expect(config.redact.patterns).toEqual([/ORG-\d+/, /TEAM-\d+/]);
    expect(config.network.ca?.[0]).toEndWith("node_modules/@rwb/ctxray-config/certs/corp.pem");
  });

  test("--config picks another file", async () => {
    const result = await load({ "ci/ctxray.json": `{ "offline": true }` }, { path: "ci/ctxray.json" });
    expect(result).toMatchObject({ ok: true, config: { offline: true, files: ["ci/ctxray.json"] } });
  });

  test.each<[string, Record<string, string>, Options, string, Record<string, string>]>([
    ["a missing --config file", {}, { path: "nope.ts" }, "config.missing", { file: "nope.ts" }],
    [
      "two config files",
      { "ctxray.config.ts": "export default {};", "ctxray.config.jsonc": "{}" },
      {},
      "config.ambiguous",
      { files: "ctxray.config.ts, ctxray.config.jsonc" },
    ],
    ["no default export", { "ctxray.config.ts": "export const config = {};" }, {}, "config.noDefault", {}],
    [
      "a config that throws",
      { "ctxray.config.ts": `throw new Error("boom");` },
      {},
      "config.unreadable",
      { message: "boom" },
    ],
    [
      "a package that isn't installed",
      { "ctxray.config.jsonc": `{ "extends": "@rwb/missing" }` },
      {},
      "config.extendsMissing",
      { name: "@rwb/missing", where: "ctxray.config.jsonc" },
    ],
    [
      "configs that extend each other",
      { "ctxray.config.jsonc": `{ "extends": "./a.jsonc" }`, "a.jsonc": `{ "extends": "./ctxray.config.jsonc" }` },
      {},
      "config.cycle",
      { chain: "ctxray.config.jsonc → a.jsonc → ctxray.config.jsonc" },
    ],
    [
      "a CA file that doesn't exist",
      { "ctxray.config.jsonc": `{ "network": { "ca": ["certs/nope.pem"] } }` },
      {},
      "config.caMissing",
      { where: "ctxray.config.jsonc" },
    ],
    [
      "a wrong value, in the inherited file",
      { "ctxray.config.jsonc": `{ "extends": "./base.jsonc" }`, "base.jsonc": `{ "reporters": ["xml"] }` },
      {},
      "config.invalid",
      { where: "base.jsonc → reporters[0]" },
    ],
    [
      "a policy that checks nothing after the merge",
      { "ctxray.config.jsonc": `{ "policies": [{ "id": "noop" }] }` },
      {},
      "config.emptyPolicy",
      { id: "noop", files: "ctxray.config.jsonc" },
    ],
    [
      "a broken pattern",
      { "ctxray.config.jsonc": `{ "redact": { "patterns": ["(x"] } }` },
      {},
      "config.badPattern",
      { where: "ctxray.config.jsonc → redact.patterns[0]" },
    ],
  ])("reports %s", async (_, files, options, key, params) => {
    const result = await load(files, options);
    expect(result).toMatchObject({ ok: false, problems: [{ key, params }] });
  });

  test.each([
    ["en", "Unrecognized key"],
    ["ru", "Нераспознанный ключ"],
  ])("words Zod's messages in %s", async (lang, text) => {
    const result = await load({ "ctxray.config.jsonc": `{ "harness": {} }` }, { lang });
    expect(result.ok ? "" : String(result.problems[0]?.params["message"])).toContain(text);
  });

  test("CTXRAY_UPSTREAM beats the file", async () => {
    const result = await load(
      { "ctxray.config.jsonc": `{ "upstream": "https://file" }` },
      { env: { CTXRAY_UPSTREAM: "https://env" } },
    );
    expect(result).toMatchObject({ ok: true, config: { upstream: "https://env" } });
  });
});
