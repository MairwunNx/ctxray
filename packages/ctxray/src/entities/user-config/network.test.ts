import { describe, expect, test } from "bun:test";
import type { Env } from "#shared/infra/index.ts";
import { type Config, finalizeConfig } from "./config.ts";
import { resolveNetwork } from "./network.ts";

const config = (network: Config["network"] = {}, offline = false) => finalizeConfig({ network, offline }, {}, []);

describe("resolveNetwork", () => {
  test.each<[string, Config["network"], Env, string | undefined, string | undefined]>([
    ["nothing set", {}, {}, undefined, undefined],
    ["upper-case variables", {}, { HTTPS_PROXY: "http://s:1", HTTP_PROXY: "http://p:1" }, "http://s:1", "http://p:1"],
    [
      "lower case wins, as in Bun",
      {},
      { HTTPS_PROXY: "http://upper:1", https_proxy: "http://lower:1" },
      "http://lower:1",
      undefined,
    ],
    [
      "an empty lower-case value doesn't count",
      {},
      { https_proxy: "", HTTPS_PROXY: "http://upper:1" },
      "http://upper:1",
      undefined,
    ],
    [
      "the config beats both",
      { proxy: "http://cfg:1" },
      { HTTPS_PROXY: "http://env:1" },
      "http://cfg:1",
      "http://cfg:1",
    ],
  ])("proxy: %s", (_, network, env, https, http) => {
    const settings = resolveNetwork(config(network), env);
    expect([settings.httpsProxy, settings.httpProxy]).toEqual([https, http]);
  });

  test.each<[string, Config["network"], Env, string[]]>([
    ["unset", {}, {}, []],
    ["a list with spaces", {}, { NO_PROXY: "localhost, .corp.test ,," }, ["localhost", ".corp.test"]],
    ["lower case wins", {}, { NO_PROXY: "a", no_proxy: "b" }, ["b"]],
    ["the config beats the variable", { noProxy: [".corp.test"] }, { NO_PROXY: "other" }, [".corp.test"]],
    ["an empty config list means no bypass", { noProxy: [] }, { NO_PROXY: "other" }, []],
  ])("noProxy: %s", (_, network, env, expected) => {
    expect(resolveNetwork(config(network), env).noProxy).toEqual(expected);
  });

  test.each<[string, Config["network"], Env, string[], boolean]>([
    ["nothing", {}, {}, [], false],
    [
      "config files and NODE_EXTRA_CA_CERTS add up",
      { ca: ["/org/ca.pem"] },
      { NODE_EXTRA_CA_CERTS: "/env.pem" },
      ["/org/ca.pem", "/env.pem"],
      false,
    ],
    ["NODE_USE_SYSTEM_CA=1 turns the system store on", {}, { NODE_USE_SYSTEM_CA: "1" }, [], true],
    ["the config can turn it off", { systemCa: false }, { NODE_USE_SYSTEM_CA: "1" }, [], false],
  ])("CA: %s", (_, network, env, files, system) => {
    const settings = resolveNetwork(config(network), env);
    expect([settings.caFiles, settings.systemCa]).toEqual([files, system]);
  });

  test("offline comes from the config", () => {
    expect(resolveNetwork(config({}, true), {}).offline).toBe(true);
  });
});

describe("finalizeConfig", () => {
  test.each<[string, Env, boolean, string | undefined]>([
    ["the file decides", {}, false, "https://file"],
    ["CTXRAY_UPSTREAM beats the file", { CTXRAY_UPSTREAM: "https://env" }, false, "https://env"],
    ["an empty CTXRAY_UPSTREAM doesn't count", { CTXRAY_UPSTREAM: "" }, false, "https://file"],
    ["CTXRAY_OFFLINE=1 turns offline on", { CTXRAY_OFFLINE: "1" }, true, "https://file"],
    ["CTXRAY_OFFLINE=false leaves it off", { CTXRAY_OFFLINE: "false" }, false, "https://file"],
  ])("%s", (_, env, offline, upstream) => {
    const config = finalizeConfig({ upstream: "https://file" }, env, []);
    expect([config.offline, config.upstream]).toEqual([offline, upstream]);
  });

  test("fills the defaults and drops harnesses set to false", () => {
    const config = finalizeConfig({ harnesses: { codex: {}, "cursor-cli": false } }, {}, []);
    expect(config).toMatchObject({ harnesses: { codex: {} }, reportDir: ".ctxray/report", lang: "auto", policies: [] });
    expect(Object.keys(config.harnesses)).toEqual(["codex"]);
  });
});
