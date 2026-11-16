import { describe, expect, test } from "bun:test";
import { formula, scoopManifest } from "./manifests.ts";
import { archive, TARGETS } from "./targets.ts";

const sums = new Map(TARGETS.map((target, index) => [archive(target), String(index).repeat(64)]));
const sumOf = (name: string) => sums.get(`ctxray-${name}.${name.startsWith("windows") ? "zip" : "tar.gz"}`);

describe("formula", () => {
  const ruby = formula("1.2.3", sums);

  test.each(["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64"])("%s comes with its checksum", (name) => {
    const url = `https://github.com/MairwunNx/ctxray/releases/download/v1.2.3/ctxray-${name}.tar.gz`;
    expect(ruby).toContain(`url "${url}"\n      sha256 "${sumOf(name)}"`);
  });

  test("names the version", () => {
    expect(ruby).toContain('version "1.2.3"');
  });

  test("fails without a checksum it needs", () => {
    expect(() => formula("1.2.3", new Map())).toThrow("SHA256SUMS has no ctxray-darwin-arm64.tar.gz");
  });
});

describe("scoopManifest", () => {
  const manifest = JSON.parse(scoopManifest("1.2.3", sums));

  test.each([
    ["64bit", "windows-x64"],
    ["arm64", "windows-arm64"],
  ])("%s takes %s", (arch, name) => {
    expect(manifest.architecture[arch]).toEqual({
      url: `https://github.com/MairwunNx/ctxray/releases/download/v1.2.3/ctxray-${name}.zip`,
      hash: sumOf(name),
    });
  });

  test("updates itself from the release's SHA256SUMS", () => {
    expect(manifest.autoupdate.hash).toEqual({ url: "$baseurl/SHA256SUMS" });
    expect(manifest.bin).toBe("ctxray.exe");
  });
});
