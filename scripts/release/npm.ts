// The npm packages of a release, in dist/release/npm: one per platform with its binary, and
// @mairwunnx/ctxray with the types, the `ctxray` launcher, and every platform package as an optional dependency.
import { chmod, copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { exe, type Target } from "./targets.ts";
import { emitTypes } from "./types.ts";

const SCOPE = "@mairwunnx";
const OS_NAMES = { linux: "Linux", darwin: "macOS", win32: "Windows" } as const;

type Manifest = Record<string, unknown>;
const writeJson = (path: string, value: unknown) => Bun.write(path, `${JSON.stringify(value, null, 2)}\n`);

const bundle = async (entry: string, outfile: string, banner = "") => {
  const result = await Bun.build({ entrypoints: [entry], target: "node", format: "esm", minify: true, banner });
  const [output] = result.outputs;
  if (!result.success || !output) throw new AggregateError(result.logs, `can't bundle ${entry}`);
  await Bun.write(outfile, await output.text());
};

const platformPackage = async (base: Manifest, target: Target, binary: string, out: string) => {
  const name = `${SCOPE}/ctxray-${target.name}`;
  const dir = join(out, `ctxray-${target.name}`);
  await mkdir(dir, { recursive: true });
  await copyFile(binary, join(dir, exe(target)));
  await chmod(join(dir, exe(target)), 0o755);
  await copyFile("LICENSE", join(dir, "LICENSE"));
  await writeJson(join(dir, "package.json"), {
    name,
    version: base["version"],
    description: `The ctxray binary for ${OS_NAMES[target.os]} ${target.cpu}${target.libc === "musl" ? " (musl)" : ""}`,
    license: base["license"],
    repository: base["repository"],
    homepage: base["homepage"],
    os: [target.os],
    cpu: [target.cpu],
    ...(target.os === "linux" ? { libc: [target.libc] } : {}),
    preferUnplugged: true,
  });
  return name;
};

// `binaries` maps a target to its compiled binary. Returns the folders to publish, the platforms first.
export const npmPackages = async (targets: readonly Target[], binaries: (target: Target) => string, out: string) => {
  const base: Manifest = await Bun.file("packages/ctxray/package.json").json();
  const dirs: string[] = [];
  const optional: Record<string, string> = {};
  for (const target of targets.filter((one) => one.npm)) {
    optional[await platformPackage(base, target, binaries(target), out)] = String(base["version"]);
    dirs.push(join(out, `ctxray-${target.name}`));
  }

  const dir = join(out, "ctxray");
  const types = await emitTypes(join(dir, "types"));
  const dependencies = base["dependencies"] as Record<string, string>;
  await bundle("packaging/npm/launcher.ts", join(dir, "bin", "ctxray.js"), "#!/usr/bin/env node");
  await chmod(join(dir, "bin", "ctxray.js"), 0o755);
  await bundle("packaging/npm/api.ts", join(dir, "index.js"));
  await copyFile("LICENSE", join(dir, "LICENSE"));
  await copyFile("README.md", join(dir, "README.md"));
  await writeJson(join(dir, "package.json"), {
    ...Object.fromEntries(
      Object.entries(base).filter(([key]) => !["exports", "imports", "bin", "engines"].includes(key)),
    ),
    bin: { ctxray: "bin/ctxray.js" },
    exports: { ".": { types: types.entry, default: "./index.js" }, "./package.json": "./package.json" },
    imports: types.imports,
    // The declarations import these packages: the editor needs their types too.
    dependencies: Object.fromEntries(types.external.map((name) => [name, dependencies[name]])),
    devDependencies: undefined,
    optionalDependencies: optional,
  });
  dirs.push(dir);
  return dirs;
};
