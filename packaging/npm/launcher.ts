// `ctxray` from npm: runs the binary that this platform's package brought, the way esbuild and Biome ship
// theirs. npm installs only the optional dependency whose `os`, `cpu`, and `libc` match the machine.
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { t } from "./translate.ts";

const require = createRequire(import.meta.url);
const versionOf = (path: string): string => JSON.parse(readFileSync(path, "utf8")).version;

const musl = () => {
  try {
    return readdirSync("/lib").some((name) => name.startsWith("ld-musl-"));
  } catch {
    return false;
  }
};
const os = process.platform === "win32" ? "windows" : process.platform;
const platform = `${os}-${process.arch}${os === "linux" && musl() ? "-musl" : ""}`;
const name = `@mairwunnx/ctxray-${platform}`;

let manifest: string;
try {
  manifest = require.resolve(`${name}/package.json`);
} catch {
  console.error(t("npm.missing", { platform, package: name }));
  process.exit(1);
}

// The launcher lands in bin/ctxray.js, next to the package's own package.json.
const version = versionOf(fileURLToPath(new URL("../package.json", import.meta.url)));
const binary = versionOf(manifest);
if (binary !== version) console.error(t("npm.skew", { version, package: name, binary }));

const exe = join(dirname(manifest), os === "windows" ? "ctxray.exe" : "ctxray");
const run = spawnSync(exe, process.argv.slice(2), { stdio: "inherit" });
if (run.error) throw run.error;
if (run.signal) process.kill(process.pid, run.signal);
process.exit(run.status ?? 1);
