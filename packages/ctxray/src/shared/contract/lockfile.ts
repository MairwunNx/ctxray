import { z } from "zod";
import { HarnessId } from "./harness.ts";

export const LOCKFILE_VERSION = 1;
export const LOCKFILE_NAME = "ctxray.lock";

// One native build: the npm package that carries it, `name@version`, and the integrity of its tarball.
export const LockedPackage = z.strictObject({
  package: z.string().describe("The npm package with the build for this platform, `name@version`"),
  integrity: z.string().describe("Subresource integrity of the package tarball, `sha512-…`"),
});
export type LockedPackage = z.output<typeof LockedPackage>;

export const LockedHarness = z.discriminatedUnion("source", [
  z.strictObject({
    source: z.literal("registry"),
    range: z.string().describe("What `ctxray harness add` asked for: a range like `2.x` or a tag like `stable`"),
    version: z.string().describe("The exact version it resolved to"),
    platforms: z
      .record(z.string(), LockedPackage)
      .describe("A build per platform key, like `darwin-arm64` or `linux-x64-musl`"),
  }),
  z.strictObject({
    source: z.literal("system"),
    version: z.string().describe("The version of the harness found in PATH when it was locked"),
  }),
]);
export type LockedHarness = z.output<typeof LockedHarness>;
export type RegistryHarness = Extract<LockedHarness, { source: "registry" }>;

export const Lockfile = z
  .strictObject({
    lockfileVersion: z.literal(LOCKFILE_VERSION),
    harnesses: z.partialRecord(HarnessId, LockedHarness),
  })
  .describe("ctxray.lock: the exact harness versions a project tests with. Only `ctxray harness` changes it");
export type Lockfile = z.output<typeof Lockfile>;
