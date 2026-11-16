// The platforms a release ships. `bun` is Bun's compile target. `npm` is how the platform package declares itself
// to npm: the baseline build (x64 without AVX2) has nothing npm could tell it apart by, so only the archive and
// install.sh carry it.
export type Target = {
  name: string;
  bun: `bun-${string}`;
  os: "linux" | "darwin" | "win32";
  cpu: "x64" | "arm64";
  libc?: "glibc" | "musl";
  npm: boolean;
};

export const TARGETS: readonly Target[] = [
  { name: "linux-x64", bun: "bun-linux-x64", os: "linux", cpu: "x64", libc: "glibc", npm: true },
  { name: "linux-x64-baseline", bun: "bun-linux-x64-baseline", os: "linux", cpu: "x64", libc: "glibc", npm: false },
  { name: "linux-arm64", bun: "bun-linux-arm64", os: "linux", cpu: "arm64", libc: "glibc", npm: true },
  { name: "linux-x64-musl", bun: "bun-linux-x64-musl", os: "linux", cpu: "x64", libc: "musl", npm: true },
  { name: "linux-arm64-musl", bun: "bun-linux-arm64-musl", os: "linux", cpu: "arm64", libc: "musl", npm: true },
  { name: "darwin-arm64", bun: "bun-darwin-arm64", os: "darwin", cpu: "arm64", npm: true },
  { name: "darwin-x64", bun: "bun-darwin-x64", os: "darwin", cpu: "x64", npm: true },
  { name: "windows-x64", bun: "bun-windows-x64", os: "win32", cpu: "x64", npm: true },
  { name: "windows-arm64", bun: "bun-windows-arm64", os: "win32", cpu: "arm64", npm: true },
];

export const exe = (target: Target) => (target.os === "win32" ? "ctxray.exe" : "ctxray");
// Release assets keep no version in their names, so `releases/latest/download/<asset>` always points at one.
export const archive = (target: Target) => `ctxray-${target.name}.${target.os === "win32" ? "zip" : "tar.gz"}`;
