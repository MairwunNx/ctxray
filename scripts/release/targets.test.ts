import { expect, test } from "bun:test";
import { archive, TARGETS } from "./targets.ts";

const archives = TARGETS.map(archive);

// install.sh and install.ps1 build an archive's name from the machine: these are all the names they can ask for.
test.each([
  "ctxray-linux-x64.tar.gz",
  "ctxray-linux-x64-baseline.tar.gz",
  "ctxray-linux-arm64.tar.gz",
  "ctxray-linux-x64-musl.tar.gz",
  "ctxray-linux-arm64-musl.tar.gz",
  "ctxray-darwin-arm64.tar.gz",
  "ctxray-darwin-x64.tar.gz",
  "ctxray-windows-x64.zip",
  "ctxray-windows-arm64.zip",
])("the release has %s", (name) => {
  expect(archives).toContain(name);
});

// The npm launcher asks for @mairwunnx/ctxray-<os>-<arch>[-musl], with Node's names for the arch.
test.each([
  ["linux", "x64", false, "linux-x64"],
  ["linux", "arm64", false, "linux-arm64"],
  ["linux", "x64", true, "linux-x64-musl"],
  ["linux", "arm64", true, "linux-arm64-musl"],
  ["darwin", "arm64", false, "darwin-arm64"],
  ["darwin", "x64", false, "darwin-x64"],
  ["windows", "x64", false, "windows-x64"],
  ["windows", "arm64", false, "windows-arm64"],
])("npm has a package for %s %s (musl: %p)", (os, arch, musl, name) => {
  const target = TARGETS.find((one) => one.name === `${os}-${arch}${musl ? "-musl" : ""}`);
  expect(target).toMatchObject({ name, npm: true, cpu: arch });
});

test("npm can't tell the baseline build from the usual one, so it skips it", () => {
  expect(TARGETS.filter((target) => target.npm).map((target) => target.name)).not.toContain("linux-x64-baseline");
});
