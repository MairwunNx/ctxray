import type { LockedPackage, Lockfile } from "#shared/contract/index.ts";
import { fail } from "./failure.ts";
import type { TarballSource } from "./install.ts";
import { shortHash } from "./integrity.ts";
import { splitSpec } from "./recipes.ts";
import type { Registry } from "./registry.ts";

// `@openai/codex@0.169.0-linux-x64` → `tarballs/e56b1614-openai-codex-0.169.0-linux-x64.tgz`.
export const tarballName = (build: LockedPackage) =>
  `tarballs/${shortHash(build.integrity)}-${build.package.replace(/^@/, "").replace(/[/@]/g, "-")}.tgz`;

// Tarballs straight from the registry: npm names the URL in the version's metadata.
export const registrySource = (registry: Registry): TarballSource =>
  async function* (build, onBytes) {
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
