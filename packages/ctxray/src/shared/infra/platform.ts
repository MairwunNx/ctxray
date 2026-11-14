import { readdirSync } from "node:fs";

// What a native harness binary is built for. Linux splits by libc: glibc binaries don't run on musl (Alpine).
export type Platform = {
  readonly os: string; // darwin, linux, win32
  readonly arch: string; // arm64, x64
  readonly libc?: "glibc" | "musl";
};

// `darwin-arm64`, `linux-x64-musl`: the key in ctxray.lock and in the cache's directory names.
export const platformKey = ({ os, arch, libc }: Platform) => [os, arch, libc].filter(Boolean).join("-");

export const parsePlatform = (key: string): Platform | undefined => {
  const [os, arch, libc] = key.split("-");
  if (os === undefined || arch === undefined) return undefined;
  if (libc !== undefined && libc !== "glibc" && libc !== "musl") return undefined;
  return libc === undefined ? { os, arch } : { os, arch, libc };
};

// Every platform ctxray resolves a harness for, so one lockfile serves a Mac, a Linux runner, and Alpine.
export const PLATFORMS: readonly Platform[] = [
  { os: "darwin", arch: "arm64" },
  { os: "darwin", arch: "x64" },
  { os: "linux", arch: "x64", libc: "glibc" },
  { os: "linux", arch: "x64", libc: "musl" },
  { os: "linux", arch: "arm64", libc: "glibc" },
  { os: "linux", arch: "arm64", libc: "musl" },
  { os: "win32", arch: "x64" },
  { os: "win32", arch: "arm64" },
];

// musl ships its dynamic loader as /lib/ld-musl-<arch>.so.1, glibc never does.
const isMusl = () => {
  try {
    return readdirSync("/lib").some((name) => name.startsWith("ld-musl-"));
  } catch {
    return false;
  }
};

export const currentPlatform = (): Platform =>
  process.platform === "linux"
    ? { os: "linux", arch: process.arch, libc: isMusl() ? "musl" : "glibc" }
    : { os: process.platform, arch: process.arch };
