// Builds everything a release ships into dist/release, without publishing anything:
//   assets/     the GitHub release: archives, SHA256SUMS, install.sh, install.ps1, schemas, templates, the plugin
//   bin/        the binaries, one folder per platform
//   docker/     the images' build context
//   npm/        the npm packages, and their tarballs in npm/packs: the tarballs keep the binaries executable
//   packaging/  what goes to the tap, the bucket, the action, and the GitLab component
// `--only linux-x64,darwin-arm64` builds some platforms, for a quick look. The release workflow builds them all
// and hands over its CycloneDX SBOM with `--sbom <file>`, so SHA256SUMS covers it too.
import { cp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { $ } from "bun";
import { jsonSchemas } from "#ctxray/shared/contract/index.ts";
import { compile, reportClient } from "./lib/compile.ts";
import { packArchive, stamp, writeChecksums } from "./release/assets.ts";
import { formula, scoopManifest } from "./release/manifests.ts";
import { npmPackages } from "./release/npm.ts";
import { exe, TARGETS, type Target } from "./release/targets.ts";

const OUT = "dist/release";
const { values } = parseArgs({ options: { only: { type: "string" }, sbom: { type: "string" } } });
const only = values.only?.split(",");
const targets = TARGETS.filter((target) => !only || only.includes(target.name));
const version: string = (await Bun.file("packages/ctxray/package.json").json()).version;
const binary = (target: Target) => join(OUT, "bin", target.name, exe(target));
const assets = join(OUT, "assets");

await rm(OUT, { recursive: true, force: true });
await mkdir(assets, { recursive: true });

const client = await reportClient();
for (const target of targets) {
  await compile(binary(target), client, target.bun as never);
  console.log(binary(target));
}

const schemas = join(OUT, "schemas");
await mkdir(schemas, { recursive: true });
for (const [name, schema] of Object.entries(jsonSchemas())) {
  const text = `${JSON.stringify(schema, null, 2)}\n`;
  await Bun.write(join(schemas, `${name}.schema.json`), text);
  await Bun.write(join(assets, `${name}.schema.json`), text);
}
const plugin = (await $`bun scripts/plugin-zip.ts`.text()).trim();
await cp(plugin, join(assets, "ctxray-claude-plugin.zip"));
await stamp("packaging/gitlab/ctxray.gitlab-ci.yml", join(assets, "ctxray.gitlab-ci.yml"), version);
await stamp("packaging/docker/harnesses.Dockerfile", join(assets, "harnesses.Dockerfile"), version);
await cp("packaging/install.sh", join(assets, "install.sh"));
await cp("packaging/install.ps1", join(assets, "install.ps1"));
for (const target of targets) await packArchive(target, binary(target), assets, schemas);
if (values.sbom) await cp(values.sbom, join(assets, "ctxray.cdx.json"));
const sums = await writeChecksums(assets);

// The images take the glibc builds: distroless/cc and node:slim are Debian.
for (const [arch, name] of [
  ["amd64", "linux-x64"],
  ["arm64", "linux-arm64"],
] as const) {
  const target = targets.find((one) => one.name === name);
  if (target) await cp(binary(target), join(OUT, "docker", arch, "ctxray"));
}
await cp("packaging/docker/Dockerfile", join(OUT, "docker", "Dockerfile"));

const packs = join(OUT, "npm", "packs");
await mkdir(packs, { recursive: true });
for (const dir of await npmPackages(targets, binary, join(OUT, "npm"))) {
  console.log((await $`npm pack ${dir} --pack-destination ${packs}`.quiet().text()).trim());
}

const packaging = join(OUT, "packaging");
for (const file of ["action.yml", "README.md"]) {
  await stamp(join("packaging/action", file), join(packaging, "action", file), version);
}
for (const file of ["templates/ctxray.yml", "README.md", ".gitlab-ci.yml"]) {
  await stamp(join("packaging/gitlab/component", file), join(packaging, "gitlab-component", file), version);
}
if (targets.length === TARGETS.length) {
  await Bun.write(join(packaging, "homebrew-tap", "Formula", "ctxray.rb"), formula(version, sums));
  await Bun.write(join(packaging, "scoop-bucket", "bucket", "ctxray.json"), scoopManifest(version, sums));
}
console.log(`${OUT}: ctxray ${version}, ${targets.length} of ${TARGETS.length} platforms`);
