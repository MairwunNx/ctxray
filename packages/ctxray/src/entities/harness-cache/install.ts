import { chmod, mkdir, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { HarnessId, LockedPackage, RegistryHarness } from "#shared/contract/index.ts";
import { type Platform, platformKey, withFileLock } from "#shared/infra/index.ts";
import type { CacheDirs } from "./dirs.ts";
import { fail } from "./failure.ts";
import { hasherFor, integrityOf, shortHash } from "./integrity.ts";
import { RECIPES } from "./recipes.ts";

export const MANIFEST = "ctxray-install.json";

// What a finished install records about itself. It's written last, so a directory without it is never used.
export type Manifest = {
  harness: HarnessId;
  version: string;
  platform: string;
  package: string;
  integrity: string;
  bin: string;
};

export type Installed = Manifest & {
  dir: string;
  binary: string; // absolute
  shared: boolean; // found in a read-only cache layer
  fresh?: boolean; // this process downloaded it, rather than finding it
};

export type Progress =
  | { phase: "waiting" } // another process installs the same build
  | { phase: "download"; done: number; total: number | undefined }
  | { phase: "unpack" };

// Where the tarball of a build comes from: the registry, or an archive from `ctxray harness pack`.
export type TarballSource = (
  build: LockedPackage,
  onBytes: (done: number, total: number | undefined) => void,
) => AsyncIterable<Uint8Array>;

// `harnesses/codex/0.169.0+darwin-arm64+e56b1614`: immutable once it exists.
export const entryPath = (harness: HarnessId, version: string, platform: string, integrity: string) =>
  join("harnesses", harness, `${version}+${platform}+${shortHash(integrity)}`);

export const readManifest = async (dir: string): Promise<Manifest | undefined> => {
  const file = Bun.file(join(dir, MANIFEST));
  return (await file.exists()) ? ((await file.json()) as Manifest) : undefined;
};

export const createHarnessCache = (dirs: CacheDirs) => {
  const buildOf = (harness: HarnessId, locked: RegistryHarness, platform: Platform) => {
    const key = platformKey(platform);
    const build =
      locked.platforms[key] ?? fail("provision.noBuild", { harness, version: locked.version, platform: key });
    return { key, build, path: entryPath(harness, locked.version, key, build.integrity) };
  };

  const find = async (
    harness: HarnessId,
    locked: RegistryHarness,
    platform: Platform,
  ): Promise<Installed | undefined> => {
    const key = platformKey(platform);
    const build = locked.platforms[key];
    if (build === undefined) return undefined;
    for (const root of dirs.all) {
      const dir = join(root, entryPath(harness, locked.version, key, build.integrity));
      const manifest = await readManifest(dir).catch(() => undefined);
      if (manifest?.integrity !== build.integrity) continue;
      const shared = root !== dirs.write;
      // The last use, for `ctxray cache prune`. Read-only layers belong to someone else.
      if (!shared) await Bun.write(`${dir}.used`, "").catch(() => {});
      return { ...manifest, dir, binary: join(dir, "package", manifest.bin), shared };
    }
    return undefined;
  };

  // Downloads into a temporary folder, checks the integrity, unpacks, and renames into place: a half-done
  // install is never visible. Two processes installing the same build take turns, and the second finds it.
  const install = async (
    harness: HarnessId,
    locked: RegistryHarness,
    platform: Platform,
    source: TarballSource,
    onProgress: (progress: Progress) => void = () => {},
  ): Promise<Installed> => {
    const recipe = RECIPES[harness] ?? fail("provision.unsupported", { harness });
    const { key, build, path } = buildOf(harness, locked, platform);
    const root = dirs.write ?? fail("provision.readOnly", { dirs: dirs.all.join(", ") });
    const final = join(root, path);
    await mkdir(dirname(final), { recursive: true });
    const work = async () => {
      const found = await find(harness, locked, platform);
      if (found) return found;
      const tmp = join(root, "tmp", `${harness}-${crypto.randomUUID().slice(0, 8)}`);
      await mkdir(tmp, { recursive: true });
      try {
        const check = hasherFor(build.integrity) ?? fail("provision.badIntegrity", { package: build.package });
        const tarball = join(tmp, "package.tgz");
        const writer = Bun.file(tarball).writer();
        for await (const chunk of source(build, (done, total) => onProgress({ phase: "download", done, total }))) {
          check.hasher.update(chunk);
          writer.write(chunk);
        }
        await writer.end();
        const actual = integrityOf(check.hasher);
        if (actual !== check.expected)
          fail("provision.integrity", { package: build.package, expected: check.expected, actual });
        onProgress({ phase: "unpack" });
        const unpacked = join(tmp, "entry");
        await new Bun.Archive(await Bun.file(tarball).bytes()).extract(unpacked);
        const bin = await recipe.bin(join(unpacked, "package"), platform);
        // Executable whatever mode the tarball stored.
        await chmod(join(unpacked, "package", bin), 0o755).catch(() => {});
        if (!(await Bun.file(join(unpacked, "package", bin)).exists()))
          fail("provision.noBinary", { package: build.package, bin });
        const manifest: Manifest = {
          harness,
          version: locked.version,
          platform: key,
          package: build.package,
          integrity: build.integrity,
          bin,
        };
        await Bun.write(join(unpacked, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
        await rename(unpacked, final).catch(async (error) => {
          if (!(await readManifest(final).catch(() => undefined))) throw error;
        });
      } finally {
        await rm(tmp, { recursive: true, force: true });
      }
      const installed = await find(harness, locked, platform);
      return installed
        ? { ...installed, fresh: true }
        : fail("provision.noBinary", { package: build.package, bin: final });
    };
    return withFileLock(`${final}.lock`, work, { onWait: () => onProgress({ phase: "waiting" }) });
  };

  return { find, install };
};
export type HarnessCache = ReturnType<typeof createHarnessCache>;
