// Publishes the tarballs scripts/release.ts packed into dist/release/npm/packs, the platform packages first, so
// @mairwunnx/ctxray never points at one that isn't there yet. A version npm already has is skipped, which lets
// a failed release run again.
//   bun scripts/release/publish-npm.ts --tag latest|next [--dry-run]
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { $ } from "bun";

const DIR = "dist/release/npm/packs";
const { values } = parseArgs({ options: { tag: { type: "string" }, "dry-run": { type: "boolean" } } });
const tag = values.tag;
if (tag !== "latest" && tag !== "next") throw new Error("--tag takes latest or next");
const dry = values["dry-run"] === true;

const manifestOf = async (tarball: string) =>
  JSON.parse(await $`tar -xzOf ${tarball} package/package.json`.text()) as { name: string; version: string };
const published = async (name: string, version: string) =>
  (await $`npm view ${`${name}@${version}`} version`.nothrow().quiet().text()).trim() === version;

const tarballs = (await readdir(DIR)).filter((name) => name.endsWith(".tgz")).map((name) => join(DIR, name));
const manifests = await Promise.all(tarballs.map(async (path) => ({ path, ...(await manifestOf(path)) })));
const ordered = manifests.sort(
  (a, b) => Number(a.name === "@mairwunnx/ctxray") - Number(b.name === "@mairwunnx/ctxray"),
);

// Provenance links each package to the workflow run that built it, it needs the run's OIDC token.
const provenance = process.env["GITHUB_ACTIONS"] === "true" && !dry ? ["--provenance"] : [];
for (const { path, name, version } of ordered) {
  if (await published(name, version)) {
    console.log(`${name}@${version} is on npm already`);
    continue;
  }
  await $`npm publish ${path} --access public --tag ${tag} ${provenance} ${dry ? ["--dry-run"] : []}`;
}
