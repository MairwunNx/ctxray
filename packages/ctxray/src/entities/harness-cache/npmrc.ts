import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type { Env } from "#shared/infra/index.ts";

export const DEFAULT_REGISTRY = "https://registry.npmjs.org/";

// What ctxray takes from the user's npm setup: where each package comes from, the credentials for each
// registry, and extra CA certificates (ADR 0003: Bun drops `.npmrc` CAs behind a proxy, so ctxray reads them).
export type RegistrySetup = {
  readonly registryOf: (name: string) => string; // with a trailing slash
  readonly authOf: (url: string) => string | undefined; // the Authorization header for a URL
  readonly ca: readonly string[]; // PEM text
};

const present = (value: string | undefined) => (value === undefined || value === "" ? undefined : value);

// `${NPM_TOKEN}` in an .npmrc reads the environment, as npm and Bun do.
const expand = (value: string, env: Env) => value.replace(/\$\{([^}]+)\}/g, (_, name: string) => env[name] ?? "");

const unquote = (value: string) => (/^(["']).*\1$/.test(value) ? value.slice(1, -1) : value);

export const parseNpmrc = (text: string, env: Env): Map<string, string[]> => {
  const entries = new Map<string, string[]>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#") || line.startsWith(";")) continue;
    const equals = line.indexOf("=");
    if (equals === -1) continue;
    const key = line.slice(0, equals).trim().replace(/\[\]$/, "");
    const value = expand(unquote(line.slice(equals + 1).trim()), env);
    entries.set(key, [...(key === "ca" ? (entries.get(key) ?? []) : []), value]);
  }
  return entries;
};

const slash = (url: string) => (url.endsWith("/") ? url : `${url}/`);
const nerf = (url: string) => url.replace(/^https?:/, "");

// The user's .npmrc, then the project's over it. A relative cafile is relative to its .npmrc.
const readAll = async (project: string, env: Env, home: string) => {
  const files = [present(env["NPM_CONFIG_USERCONFIG"]) ?? join(home, ".npmrc"), join(project, ".npmrc")];
  const merged = new Map<string, string[]>();
  const ca: string[] = [];
  for (const file of files) {
    const handle = Bun.file(file);
    if (!(await handle.exists())) continue;
    const entries = parseNpmrc(await handle.text(), env);
    for (const [key, values] of entries) merged.set(key, values);
    const cafile = entries.get("cafile")?.[0];
    if (cafile !== undefined)
      ca.push(await Bun.file(isAbsolute(cafile) ? cafile : resolve(dirname(file), cafile)).text());
    ca.push(...(entries.get("ca") ?? []).map((pem) => pem.replace(/\\n/g, "\n")));
  }
  return { merged, ca };
};

// ctxray's own config wins, then a scope's registry, the environment, the .npmrc files, and npmjs.org.
export const readRegistrySetup = async (
  project: string,
  env: Env,
  configured: string | undefined,
  home: string = homedir(),
): Promise<RegistrySetup> => {
  const { merged, ca } = await readAll(project, env, home);
  const one = (key: string) => merged.get(key)?.[0];
  const fromEnv = ["NPM_CONFIG_REGISTRY", "npm_config_registry", "BUN_CONFIG_REGISTRY"].map((name) =>
    present(env[name]),
  );
  const fallback = slash(fromEnv.find((value) => value !== undefined) ?? one("registry") ?? DEFAULT_REGISTRY);
  const registryOf = (name: string) => {
    if (configured !== undefined) return slash(configured);
    const scope = name.startsWith("@") ? name.slice(0, name.indexOf("/")) : undefined;
    const scoped = scope === undefined ? undefined : one(`${scope}:registry`);
    return scoped === undefined ? fallback : slash(scoped);
  };
  // Credentials go only where they're meant: the longest `//host/path/:` prefix of the URL.
  const authOf = (url: string) => {
    const target = nerf(url);
    const prefixes = [...merged.keys()]
      .filter((key) => key.startsWith("//"))
      .map((key) => key.slice(0, key.lastIndexOf(":") + 1))
      .filter((prefix) => target.startsWith(prefix.slice(0, -1)))
      .sort((a, b) => b.length - a.length);
    for (const prefix of new Set(prefixes)) {
      const token = one(`${prefix}_authToken`);
      if (token !== undefined) return `Bearer ${token}`;
      const auth = one(`${prefix}_auth`);
      if (auth !== undefined) return `Basic ${auth}`;
      const user = one(`${prefix}username`);
      const password = one(`${prefix}_password`);
      if (user !== undefined && password !== undefined) return `Basic ${btoa(`${user}:${atob(password)}`)}`;
    }
    return undefined;
  };
  return { registryOf, authOf, ca };
};
