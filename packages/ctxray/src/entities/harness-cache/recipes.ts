import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { HarnessId } from "#shared/contract/index.ts";
import type { Platform } from "#shared/infra/index.ts";

// How ctxray installs a harness from npm: the package whose versions it resolves, the package with the native
// build for a platform, and where the executable sits inside it (ADR 0005, 0006). No install scripts run.
export type Recipe = {
  readonly package: string;
  readonly tag: string; // the dist-tag `harness add` takes without a range
  readonly build: (version: string, platform: Platform) => string | undefined; // `name@version`, or a URL
  readonly bin: (dir: string, platform: Platform) => Promise<string>; // relative to the unpacked package
  readonly root?: string; // the archive's top folder when it isn't npm's `package`
  // A harness that isn't on npm: where its latest version shows, and the checksum file next to each build.
  readonly download?: {
    readonly latest: (text: (url: string) => Promise<string | undefined>) => Promise<string | undefined>;
    readonly checksum: (url: string) => string;
  };
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

// Gemini CLI is one bundled script for every platform, run by Node (ADR 0007). Its native extras are optional.
const geminiCli: Recipe = {
  package: "@google/gemini-cli",
  tag: "latest",
  build: (version) => `@google/gemini-cli@${version}`,
  bin: async () => "bundle/gemini.js",
};

// OpenCode ships one Bun-compiled executable per platform package, Windows under the name `windows`
// (ADR 0008). The wrapper's postinstall never runs: it would write into the real HOME.
const opencode: Recipe = {
  package: "opencode-ai",
  tag: "latest",
  build: (version, { os, arch, libc }) =>
    `opencode-${os === "win32" ? "windows" : os}-${arch}${libc === "musl" ? "-musl" : ""}@${version}`,
  bin: async (_, platform) => `bin/opencode${exe(platform)}`,
};

// Cursor's hidden local build, the one that takes a base URL (ADR 0009). Cursor serves it next to the CLI, with a
// SHA-256 beside each archive, for macOS and glibc Linux only. Its install script names the current version.
const CURSOR_DOWNLOADS = "https://downloads.cursor.com/lab";
const cursorCli: Recipe = {
  package: "cursor-agent-local",
  tag: "latest",
  build: (version, { os, arch, libc }) =>
    (os === "darwin" || (os === "linux" && libc !== "musl")) && (arch === "x64" || arch === "arm64")
      ? `${CURSOR_DOWNLOADS}/${version}/${os}/${arch}/agent-cli-local-package.tar.gz`
      : undefined,
  bin: async () => "cursor-agent-local",
  root: "dist-package",
  download: {
    latest: async (text) => {
      const script = await text("https://cursor.com/install");
      return script === undefined ? undefined : /downloads\.cursor\.com\/lab\/([\w.-]+)\//.exec(script)?.[1];
    },
    checksum: (url) => `${url}.sha256`,
  },
};

export const RECIPES: Partial<Record<HarnessId, Recipe>> = {
  "claude-code": claudeCode,
  codex,
  "gemini-cli": geminiCli,
  opencode,
  "cursor-cli": cursorCli,
};

// `@openai/codex@0.169.0-linux-x64` → its name and version.
export const splitSpec = (spec: string) => {
  const at = spec.lastIndexOf("@");
  return { name: spec.slice(0, at), version: spec.slice(at + 1) };
};
