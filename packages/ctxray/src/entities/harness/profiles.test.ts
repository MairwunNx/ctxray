import { describe, expect, test } from "bun:test";
import type { CaptureMode } from "#shared/contract/index.ts";
import type { Capability } from "./capability.ts";
import { checkSupport } from "./profile.ts";
import { PROFILES } from "./profiles.ts";

const profiles = Object.values(PROFILES);

describe("every profile", () => {
  test.each(profiles)("$id works statically", (profile) => {
    expect(profile.modes).toContain("static");
  });

  test.each(profiles)("$id captures only when it runs headless behind a proxy", (profile) => {
    if (profile.modes.includes("capture")) {
      expect(profile.capabilities).toEqual(expect.arrayContaining(["headless", "proxyable"]));
    }
  });

  test.each(profiles)("$id declares no mode both stable and experimental", (profile) => {
    expect(profile.experimentalModes.filter((mode) => profile.modes.includes(mode))).toEqual([]);
  });

  test("keys match ids", () => {
    for (const [key, profile] of Object.entries(PROFILES)) expect(profile.id).toBe(key as typeof profile.id);
  });
});

describe("checkSupport", () => {
  test.each<[keyof typeof PROFILES, Capability[], CaptureMode, boolean, string[]]>([
    ["claude-code", ["pathRules"], "capture", false, []],
    ["codex", ["pathRules"], "capture", false, ["pathRules"]],
    ["codex", ["skills", "mcp"], "capture", false, []],
    ["gemini-cli", ["intentRules"], "capture", false, ["intentRules"]],
    ["cursor-cli", ["intentRules"], "static", false, []],
    ["cursor-cli", [], "capture", false, ["experimental:capture"]],
    ["cursor-cli", [], "capture", true, []],
    ["claude-code", ["skills"], "observe", false, []],
    ["codex", [], "observe", false, ["mode:observe"]],
  ])("%s requiring %j in %s (experimental: %p) misses %j", (id, requires, mode, experimental, missing) => {
    const support = checkSupport(PROFILES[id], { requires, mode, experimental });
    expect(support).toEqual(missing.length === 0 ? { supported: true } : { supported: false, missing });
  });
});
