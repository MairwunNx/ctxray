import { afterAll, describe, expect, test } from "bun:test";
import {
  claudeBuilds,
  codexBuilds,
  geminiBuilds,
  opencodeBuilds,
  startFakeRegistry,
} from "#fixtures/registry/fake-registry.ts";
import { DIRECT } from "#shared/infra/index.ts";
import { readRegistrySetup } from "./npmrc.ts";
import { createRegistry } from "./registry.ts";
import { maxSatisfying, resolveHarness } from "./resolve.ts";

describe("maxSatisfying", () => {
  test.each<[string, string | undefined]>([
    ["0.169.x", "0.169.2"],
    ["^0.168.0", "0.168.1"],
    ["0.170.0-alpha.1", "0.170.0-alpha.1"],
    ["*", "0.169.2"],
    ["1.x", undefined],
  ])("%s → %s", (range, expected) => {
    const versions = ["0.168.0", "0.168.1", "0.169.0", "0.169.2", "0.170.0-alpha.1", "0.169.2-darwin-arm64"];
    expect(maxSatisfying(versions, range)).toBe(expected);
  });
});

const registry = await startFakeRegistry(
  [
    ...claudeBuilds("2.1.300"),
    ...claudeBuilds("2.1.311"),
    ...codexBuilds("0.169.0"),
    ...geminiBuilds("0.68.0"),
    ...opencodeBuilds("1.19.5"),
  ],
  { tags: { "@anthropic-ai/claude-code": { stable: "2.1.300", latest: "2.1.311" } } },
);
afterAll(() => registry.stop());
const client = createRegistry(await readRegistrySetup("/nonexistent", {}, registry.url, "/nonexistent"), DIRECT);

describe("resolveHarness", () => {
  test.each<[string | undefined, string]>([
    [undefined, "2.1.300"],
    ["latest", "2.1.311"],
    ["2.x", "2.1.311"],
    ["2.1.300", "2.1.300"],
  ])("Claude Code %p → %s", async (range, version) => {
    const locked = await resolveHarness(client, "claude-code", range);
    expect(locked.version).toBe(version);
    expect(Object.keys(locked.platforms)).toHaveLength(8);
    expect(locked.platforms["linux-x64-musl"]).toEqual({
      package: `@anthropic-ai/claude-code-linux-x64-musl@${version}`,
      integrity: registry.integrity(`@anthropic-ai/claude-code-linux-x64-musl@${version}`),
    });
  });

  test("Codex builds are prereleases of its own package, and Linux shares one for both libcs", async () => {
    const locked = await resolveHarness(client, "codex", "0.169.x");
    expect(locked.version).toBe("0.169.0");
    expect(locked.platforms["linux-x64-musl"]?.package).toBe("@openai/codex@0.169.0-linux-x64");
    expect(locked.platforms["linux-x64-glibc"]).toEqual(locked.platforms["linux-x64-musl"] as never);
  });

  test("Gemini CLI is one script for every platform", async () => {
    const locked = await resolveHarness(client, "gemini-cli", "0.68.0");
    expect(Object.keys(locked.platforms)).toHaveLength(8);
    expect(new Set(Object.values(locked.platforms).map((build) => build.package))).toEqual(
      new Set(["@google/gemini-cli@0.68.0"]),
    );
  });

  test.each<[string, string]>([
    ["linux-x64-musl", "opencode-linux-x64-musl@1.19.5"],
    ["linux-arm64-glibc", "opencode-linux-arm64@1.19.5"],
    ["win32-arm64", "opencode-windows-arm64@1.19.5"],
  ])("OpenCode for %s is %s", async (key, spec) => {
    const locked = await resolveHarness(client, "opencode", "1.x");
    expect(locked.platforms[key]?.package).toBe(spec);
  });

  test("a range nothing matches", async () => {
    await expect(resolveHarness(client, "codex", "9.x")).rejects.toThrow("codex has no version that matches “9.x”");
  });

  test("a harness ctxray can't install", async () => {
    await expect(resolveHarness(client, "cursor-cli", undefined)).rejects.toThrow(
      "ctxray can't install cursor-cli yet",
    );
  });
});
