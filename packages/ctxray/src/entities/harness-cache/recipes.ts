import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { HarnessId } from "#shared/contract/index.ts";
import type { Platform } from "#shared/infra/index.ts";

// How ctxray installs a harness from npm: the package whose versions it resolves, the package with the native
// build for a platform, and where the executable sits inside it (ADR 0005, 0006). No install scripts run.
export type Recipe = {
  readonly package: string;
  readonly tag: string; // the dist-tag `harness add` takes without a range
  readonly build: (version: string, platform: Platform) => string | undefined; // `name@version`
  readonly bin: (dir: string, platform: Platform) => Promise<string>; // relative to the unpacked package
};

const exe = (platform: Platform) => (platform.os === "win32" ? ".exe" : "");

const claudeCode: Recipe = {
  package: "@anthropic-ai/claude-code",
  tag: "stable",
  build: (version, { os, arch, libc }) =>
    `@anthropic-ai/claude-code-${os}-${arch}${libc === "musl" ? "-musl" : ""}@${version}`,
  bin: async (_, platform) => `claude${exe(platform)}`,
};

// Codex publishes each build as a prerelease of the package itself. Its Linux builds are static musl
// binaries, so glibc and musl share them.
const codex: Recipe = {
  package: "@openai/codex",
  tag: "latest",
  build: (version, { os, arch }) => `@openai/codex@${version}-${os}-${arch}`,
  bin: async (dir, platform) => {
    const [triple] = await readdir(join(dir, "vendor"));
    if (triple === undefined) return `vendor/codex${exe(platform)}`;
    const layout = (await Bun.file(join(dir, "vendor", triple, "codex-package.json")).json()) as {
      entrypoint?: string;
    };
    return `vendor/${triple}/${layout.entrypoint ?? `bin/codex${exe(platform)}`}`;
  },
};

export const RECIPES: Partial<Record<HarnessId, Recipe>> = { "claude-code": claudeCode, codex };

// `@openai/codex@0.169.0-linux-x64` → its name and version.
export const splitSpec = (spec: string) => {
  const at = spec.lastIndexOf("@");
  return { name: spec.slice(0, at), version: spec.slice(at + 1) };
};
