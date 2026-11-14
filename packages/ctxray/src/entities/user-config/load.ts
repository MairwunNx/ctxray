import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { POLICY_CHECKS, type Policy, UserConfig } from "../../shared/contract/index.ts";
import type { Env } from "../../shared/infra/index.ts";
import { type Config, finalizeConfig } from "./config.ts";
import { mergeConfigs } from "./merge.ts";
import { ConfigFailure, type ConfigProblem, fail, issueProblem, zodErrors } from "./problem.ts";
import { CONFIG_FILES, readConfigFile } from "./read.ts";

export type LoadResult = { ok: true; config: Config } | { ok: false; problems: readonly ConfigProblem[] };
export type ConfigLoader = (path: string | undefined, lang: string) => Promise<LoadResult>;

type Layer = { file: string; config: UserConfig };

const checksNothing = (policy: Policy) => POLICY_CHECKS.every((check) => policy[check] === undefined);

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
const exists = (file: string) => Bun.file(file).exists();

export const createConfigLoader = (cwd: string, env: Env): ConfigLoader => {
  const show = (file: string) => {
    const path = relative(cwd, file);
    return path.startsWith("..") || isAbsolute(path) ? file : path;
  };

  const find = async (path: string | undefined): Promise<string | undefined> => {
    if (path !== undefined) {
      const file = resolve(cwd, path);
      return (await exists(file)) ? file : fail("config.missing", { file: path });
    }
    const found = [];
    for (const name of CONFIG_FILES) if (await exists(join(cwd, name))) found.push(name);
    if (found.length > 1) fail("config.ambiguous", { files: found.join(", ") });
    return found[0] === undefined ? undefined : join(cwd, found[0]);
  };

  // A path in a config is relative to that config, so an org package can ship its own CA file.
  const withOwnPaths = async (config: UserConfig, file: string): Promise<UserConfig> => {
    const ca = config.network?.ca?.map((path) => resolve(dirname(file), path));
    if (!ca) return config;
    for (const path of ca) if (!(await exists(path))) fail("config.caMissing", { where: show(file), file: path });
    return { ...config, network: { ...config.network, ca } };
  };

  const extended = (specifier: string, file: string) => {
    try {
      return Bun.resolveSync(specifier, dirname(file));
    } catch {
      return fail("config.extendsMissing", { name: specifier, where: show(file) });
    }
  };

  // Depth first, so every config comes after the ones it extends and wins over them.
  const collect = async (file: string, chain: readonly string[], lang: string): Promise<Layer[]> => {
    if (chain.includes(file)) fail("config.cycle", { chain: [...chain, file].map(show).join(" → ") });
    let raw: unknown;
    try {
      raw = await readConfigFile(file);
    } catch (error) {
      fail("config.unreadable", { file: show(file), message: message(error) });
    }
    if (raw === undefined) fail("config.noDefault", { file: show(file) });
    const parsed = UserConfig.safeParse(raw, { error: zodErrors(lang) });
    if (!parsed.success) throw new ConfigFailure(parsed.error.issues.map((issue) => issueProblem(issue, show(file))));
    const config = await withOwnPaths(parsed.data, file);
    const specifiers = typeof config.extends === "string" ? [config.extends] : (config.extends ?? []);
    const layers: Layer[] = [];
    for (const specifier of specifiers)
      layers.push(...(await collect(extended(specifier, file), [...chain, file], lang)));
    return [...layers, { file, config }];
  };

  return async (path, lang) => {
    try {
      const file = await find(path);
      const layers = file === undefined ? [] : await collect(file, [], lang);
      const merged = layers.reduce<UserConfig>((base, layer) => mergeConfigs(base, layer.config), {});
      const files = layers.map((layer) => show(layer.file));
      const empty = merged.policies?.find(checksNothing);
      if (empty) fail("config.emptyPolicy", { id: empty.id, files: files.join(", ") });
      return { ok: true, config: finalizeConfig(merged, env, files) };
    } catch (error) {
      if (error instanceof ConfigFailure) return { ok: false, problems: error.problems };
      throw error;
    }
  };
};
createConfigLoader.inject = ["cwd", "env"] as const;
