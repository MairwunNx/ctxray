import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultCacheDir } from "./dirs.ts";
import { readRegistrySetup } from "./npmrc.ts";

const root = mkdtempSync(join(tmpdir(), "ctxray-npmrc-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

let count = 0;
const setupOf = async (project: string, user = "", env: Record<string, string> = {}, configured?: string) => {
  const dir = join(root, String(++count));
  mkdirSync(join(dir, "home"), { recursive: true });
  mkdirSync(join(dir, "project"), { recursive: true });
  writeFileSync(join(dir, "home/.npmrc"), user);
  writeFileSync(join(dir, "project/.npmrc"), project);
  writeFileSync(join(dir, "project/corp.pem"), "-----BEGIN CERTIFICATE-----\ncorp\n-----END CERTIFICATE-----\n");
  return readRegistrySetup(join(dir, "project"), env, configured, join(dir, "home"));
};

describe("the registry a package comes from", () => {
  test.each<[string, string, Record<string, string>, string | undefined, string, string]>([
    ["nothing set", "", {}, undefined, "@openai/codex", "https://registry.npmjs.org/"],
    [
      "the project's .npmrc",
      "registry=https://nexus.corp/npm",
      {},
      undefined,
      "@openai/codex",
      "https://nexus.corp/npm/",
    ],
    [
      "a scope's own registry",
      "registry=https://nexus.corp/npm/\n@openai:registry=https://openai.corp/",
      {},
      undefined,
      "@openai/codex",
      "https://openai.corp/",
    ],
    [
      "the environment over the .npmrc",
      "registry=https://nexus.corp/npm/",
      { NPM_CONFIG_REGISTRY: "https://env.corp/" },
      undefined,
      "@openai/codex",
      "https://env.corp/",
    ],
    [
      "ctxray's config over everything",
      "@openai:registry=https://openai.corp/",
      { npm_config_registry: "https://env.corp/" },
      "https://ctxray.corp/npm",
      "@openai/codex",
      "https://ctxray.corp/npm/",
    ],
  ])("%s", async (_, npmrc, env, configured, name, expected) => {
    expect((await setupOf(npmrc, "", env, configured)).registryOf(name)).toBe(expected);
  });

  test("the project's .npmrc wins over the user's", async () => {
    const setup = await setupOf("registry=https://project.corp/", "registry=https://user.corp/");
    expect(setup.registryOf("x")).toBe("https://project.corp/");
  });
});

describe("credentials", () => {
  const npmrc = [
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the .npmrc syntax for a variable
    "//nexus.corp/npm/:_authToken=${NEXUS_TOKEN}",
    "//nexus.corp/npm/private/:_auth=dXNlcjpwYXNz",
    "//other.corp/:username=bot",
    `//other.corp/:_password=${btoa("secret")}`,
  ].join("\n");

  test.each<[string, string | undefined]>([
    ["https://nexus.corp/npm/@openai%2fcodex", "Bearer t0ken"],
    ["https://nexus.corp/npm/private/x.tgz", "Basic dXNlcjpwYXNz"],
    ["https://other.corp/x", `Basic ${btoa("bot:secret")}`],
    ["https://registry.npmjs.org/x", undefined],
    ["https://nexus.corp/other/x", undefined],
  ])("%s", async (url, expected) => {
    expect((await setupOf(npmrc, "", { NEXUS_TOKEN: "t0ken" })).authOf(url)).toBe(expected);
  });
});

test("CA certificates from cafile and ca, which Bun drops behind a proxy", async () => {
  const setup = await setupOf(
    'cafile=corp.pem\nca[]="-----BEGIN CERTIFICATE-----\\ninline\\n-----END CERTIFICATE-----"',
  );
  expect(setup.ca).toEqual([
    "-----BEGIN CERTIFICATE-----\ncorp\n-----END CERTIFICATE-----\n",
    "-----BEGIN CERTIFICATE-----\ninline\n-----END CERTIFICATE-----",
  ]);
});

test.each<[string, Record<string, string>, string]>([
  ["darwin", {}, "/home/u/Library/Caches/ctxray"],
  ["linux", {}, "/home/u/.cache/ctxray"],
  ["linux", { XDG_CACHE_HOME: "/xdg" }, "/xdg/ctxray"],
  ["win32", { LOCALAPPDATA: "C:/Users/u/AppData/Local" }, "C:/Users/u/AppData/Local/ctxray/Cache"],
  ["linux", { CTXRAY_CACHE_DIR: "/ci/.ctxray-cache" }, "/ci/.ctxray-cache"],
])("the cache on %s with %p", (os, env, expected) => {
  expect(defaultCacheDir(env, os, "/home/u").replaceAll("\\", "/")).toBe(expected);
});
