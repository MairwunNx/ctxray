import { PLATFORMS, platformKey } from "#shared/infra/index.ts";

// A tiny npm registry for tests, serving harness builds whose executables are shell scripts.
export type FakeBuild = { name: string; version: string; files: Record<string, string> };

const script = (version: string) => `#!/bin/sh\necho "${version} (fake)"\n`;

// Claude Code: one package to resolve, one package per platform with the `claude` executable in it.
export const claudeBuilds = (version: string): FakeBuild[] => [
  { name: "@anthropic-ai/claude-code", version, files: {} },
  ...PLATFORMS.map((platform) => ({
    name: `@anthropic-ai/claude-code-${platform.os}-${platform.arch}${platform.libc === "musl" ? "-musl" : ""}`,
    version,
    files: { [platform.os === "win32" ? "claude.exe" : "claude"]: script(version) },
  })),
];

// Codex: every build a prerelease of the package itself, the executable where its codex-package.json says.
export const codexBuilds = (
  version: string,
  platforms = PLATFORMS.filter((one) => one.libc !== "musl"),
): FakeBuild[] => [
  { name: "@openai/codex", version, files: {} },
  ...platforms.map((platform) => ({
    name: "@openai/codex",
    version: `${version}-${platform.os}-${platform.arch}`,
    files: {
      "vendor/triple/codex-package.json": JSON.stringify({ entrypoint: "bin/codex" }),
      "vendor/triple/bin/codex": script(version),
    },
  })),
];

const tarballOf = ({ files }: FakeBuild) =>
  new Bun.Archive(
    Object.fromEntries([
      ["package/package.json", "{}"],
      ...Object.entries(files).map(([path, text]) => [`package/${path}`, text]),
    ]),
    { compress: "gzip" },
  ).bytes();

const sri = (bytes: Uint8Array) => `sha512-${new Bun.CryptoHasher("sha512").update(bytes).digest("base64")}`;

export type FakeRegistryOptions = { token?: string; tags?: Record<string, Record<string, string>>; corrupt?: boolean };

export const startFakeRegistry = async (builds: readonly FakeBuild[], options: FakeRegistryOptions = {}) => {
  const tarballs = new Map<string, Uint8Array>();
  for (const build of builds) tarballs.set(`${build.name}@${build.version}`, await tarballOf(build));
  const downloads: string[] = [];
  const server = Bun.serve({
    port: 0,
    fetch: (request): Response => {
      if (options.token && request.headers.get("authorization") !== `Bearer ${options.token}`) {
        return new Response("unauthorized", { status: 401 });
      }
      const path = decodeURIComponent(new URL(request.url).pathname.slice(1));
      if (path.startsWith("-/tarballs/")) {
        const spec = path.slice("-/tarballs/".length);
        downloads.push(spec);
        const bytes = tarballs.get(spec);
        if (!bytes) return new Response("missing", { status: 404 });
        return new Response(options.corrupt ? bytes.slice(0, -1) : bytes);
      }
      const dist = (spec: string): { tarball: string; integrity: string } => ({
        tarball: `${server.url}-/tarballs/${encodeURIComponent(spec)}`,
        integrity: sri(tarballs.get(spec) as Uint8Array),
      });
      const name = path.startsWith("@") ? path.split("/").slice(0, 2).join("/") : (path.split("/")[0] ?? "");
      const version = path.slice(name.length + 1);
      const own = builds.filter((build) => build.name === name);
      if (own.length === 0) return new Response("not found", { status: 404 });
      if (version !== "") {
        const spec = `${name}@${version}`;
        return tarballs.has(spec)
          ? Response.json({ name, version, dist: dist(spec) })
          : new Response("no", { status: 404 });
      }
      const versions = Object.fromEntries(
        own.map((build) => [build.version, { dist: dist(`${name}@${build.version}`) }]),
      );
      return Response.json({ name, "dist-tags": options.tags?.[name] ?? {}, versions });
    },
  });
  return {
    url: server.url.href,
    downloads,
    integrity: (spec: string) => sri(tarballs.get(spec) as Uint8Array),
    stop: () => server.stop(true),
  };
};

export const ALL_KEYS = PLATFORMS.map(platformKey);
