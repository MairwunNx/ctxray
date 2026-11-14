import type { LockedPackage, Lockfile } from "#shared/contract/index.ts";
import { fail } from "./failure.ts";
import type { TarballSource } from "./install.ts";
import { shortHash } from "./integrity.ts";
import { splitSpec } from "./recipes.ts";
import type { Registry } from "./registry.ts";

// `@openai/codex@0.169.0-linux-x64` → `tarballs/e56b1614-openai-codex-0.169.0-linux-x64.tgz`, a download by
// the path of its URL.
export const tarballName = (build: LockedPackage) => {
  const name = isDownload(build) ? new URL(build.package).pathname.slice(1) : build.package.replace(/^@/, "");
  return `tarballs/${shortHash(build.integrity)}-${name.replace(/[/@]/g, "-").replace(/\.tar\.gz$|\.tgz$/, "")}.tgz`;
};

// A build that isn't on npm names its download URL instead of `name@version`.
export const isDownload = (build: LockedPackage) => build.package.startsWith("https://");

// Tarballs straight from the registry, where npm names the URL in the version's metadata, or from the URL a
// download build names.
export const registrySource = (registry: Registry): TarballSource =>
  async function* (build, onBytes) {
    if (isDownload(build)) {
      yield* registry.download(build.package, onBytes);
      return;
    }
    const { name, version } = splitSpec(build.package);
    const dist =
      (await registry.dist(name, version)) ?? fail("provision.noBuild", { harness: name, version, platform: "" });
    yield* registry.download(dist.tarball, onBytes);
  };

// The builds of a lockfile for the platforms asked, as one archive for machines without a registry. The tarballs
// stay as the registry served them, so `install --from` checks the same integrity.
export const packHarnesses = async (lock: Lockfile, platforms: readonly string[], source: TarballSource) => {
  const files: Record<string, Uint8Array | string> = { "ctxray.lock": `${JSON.stringify(lock, null, 2)}\n` };
  for (const locked of Object.values(lock.harnesses)) {
    if (locked?.source !== "registry") continue;
    for (const platform of platforms) {
      const build = locked.platforms[platform];
      if (build === undefined) continue;
      const chunks: Uint8Array[] = [];
      for await (const chunk of source(build, () => {})) chunks.push(chunk);
      files[tarballName(build)] = Buffer.concat(chunks);
    }
  }
  return files;
};

// Reads the tarballs back from an archive `ctxray harness pack` wrote.
export const archiveSource = async (path: string): Promise<TarballSource> => {
  const files = await new Bun.Archive(await Bun.file(path).bytes()).files();
  return async function* (build, onBytes) {
    const file =
      files.get(tarballName(build)) ?? fail("provision.notInArchive", { package: build.package, archive: path });
    const bytes = await file.bytes();
    onBytes(bytes.byteLength, bytes.byteLength);
    yield bytes;
  };
};
