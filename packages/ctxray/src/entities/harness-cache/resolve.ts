import type { HarnessId, LockedPackage, RegistryHarness } from "#shared/contract/index.ts";
import { PLATFORMS, platformKey } from "#shared/infra/index.ts";
import { fail } from "./failure.ts";
import { RECIPES, splitSpec } from "./recipes.ts";
import type { Packument, Registry } from "./registry.ts";

// The newest version a range allows. Prereleases only when the range asks for one, like semver itself.
export const maxSatisfying = (versions: readonly string[], range: string) =>
  versions
    .filter((version) => (!version.includes("-") || range.includes("-")) && Bun.semver.satisfies(version, range))
    .sort((a, b) => Bun.semver.order(b, a))[0];

const versionOf = (packument: Packument, range: string) =>
  packument["dist-tags"][range] ?? maxSatisfying(Object.keys(packument.versions), range);

// A range or a tag to the exact version, with the integrity of its build for every platform that has one.
export const resolveHarness = async (
  registry: Registry,
  harness: HarnessId,
  range: string | undefined,
): Promise<RegistryHarness> => {
  const recipe = RECIPES[harness] ?? fail("provision.unsupported", { harness });
  const wanted = range ?? recipe.tag;
  const packument = await registry.packument(recipe.package);
  const version = versionOf(packument, wanted) ?? fail("provision.noVersion", { harness, range: wanted });
  const builds = await Promise.all(
    PLATFORMS.map(async (platform): Promise<[string, LockedPackage] | undefined> => {
      const spec = recipe.build(version, platform);
      if (spec === undefined) return undefined;
      const { name, version: exact } = splitSpec(spec);
      const dist = name === recipe.package ? packument.versions[exact]?.dist : await registry.dist(name, exact);
      return dist && [platformKey(platform), { package: spec, integrity: dist.integrity }];
    }),
  );
  const platforms = Object.fromEntries(builds.filter((build) => build !== undefined));
  if (Object.keys(platforms).length === 0) fail("provision.noBuilds", { harness, version });
  return { source: "registry", range: wanted, version, platforms };
};
