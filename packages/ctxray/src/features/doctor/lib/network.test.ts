import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { NetworkSettings } from "#entities/user-config/index.ts";
import { caChecks, proxyChecks, withoutCredentials } from "./network.ts";

const root = mkdtempSync(join(tmpdir(), "ctxray-doctor-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const network = (settings: Partial<NetworkSettings>): NetworkSettings => ({
  httpsProxy: undefined,
  httpProxy: undefined,
  noProxy: [],
  caFiles: [],
  systemCa: false,
  offline: false,
  ...settings,
});

test.each([
  ["http://proxy.corp:3128", "http://proxy.corp:3128"],
  ["http://bot:s3cret@proxy.corp:3128", "http://***@proxy.corp:3128/"],
  ["not a url", "not a url"],
])("%s shows as %s", (url, shown) => {
  expect(withoutCredentials(url)).toBe(shown);
});

test.each<[string, Partial<NetworkSettings>, Record<string, string>, string[]]>([
  ["no proxy", {}, {}, ["info doctor.noProxy"]],
  ["HTTPS_PROXY", { httpsProxy: "http://p:1" }, { HTTPS_PROXY: "http://p:1" }, ["ok doctor.proxy"]],
  [
    "HTTP_PROXY alone",
    { httpProxy: "http://p:1" },
    { HTTP_PROXY: "http://p:1" },
    ["ok doctor.proxy", "warning doctor.httpOnlyProxy"],
  ],
  [
    "NO_PROXY the curl way",
    { noProxy: ["*.corp.com", "10.0.0.0/8", ".fine.com", "localhost"] },
    {},
    ["info doctor.noProxy", "warning doctor.noProxyEntry", "warning doctor.noProxyCidr"],
  ],
])("%s", (_, settings, env, expected) => {
  expect(proxyChecks(network(settings), env).map((one) => `${one.status} ${one.key}`)).toEqual(expected);
});

test("CA files: present, missing, and not PEM", async () => {
  writeFileSync(join(root, "corp.pem"), "-----BEGIN CERTIFICATE-----\nx\n-----END CERTIFICATE-----\n");
  writeFileSync(join(root, "corp.der"), "binary");
  const files = [join(root, "corp.pem"), join(root, "missing.pem"), join(root, "corp.der")];
  const checks = await caChecks(network({ caFiles: files }));
  expect(checks.map((one) => `${one.status} ${one.key}`)).toEqual([
    "ok doctor.ca",
    "error doctor.caMissing",
    "error doctor.caNotPem",
  ]);
});
