import { expect, test } from "bun:test";
import { currentPlatform, PLATFORMS, parsePlatform, platformKey } from "./platform.ts";

test.each(PLATFORMS.map((platform) => [platformKey(platform), platform] as const))(
  "%s round-trips",
  (key, platform) => {
    expect(parsePlatform(key)).toEqual(platform);
  },
);

test.each(["", "darwin", "linux-x64-uclibc"])("%p is no platform", (key) => {
  expect(parsePlatform(key)).toBeUndefined();
});

test("this machine is one of the platforms", () => {
  expect(PLATFORMS.map(platformKey)).toContain(platformKey(currentPlatform()));
});
