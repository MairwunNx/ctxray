import { type Egress, fetchThrough } from "#shared/infra/index.ts";
import { fail } from "./failure.ts";
import type { RegistrySetup } from "./npmrc.ts";

export type Dist = { tarball: string; integrity: string };
export type Packument = {
  "dist-tags": Record<string, string>;
  versions: Record<string, { dist: Dist }>;
};

export type Download = (done: number, total: number | undefined) => void;

export type Registry = {
  packument: (name: string) => Promise<Packument>; // abbreviated: versions and their dist only
  dist: (name: string, version: string) => Promise<Dist | undefined>; // undefined when the registry has none
  download: (url: string, onBytes?: Download) => AsyncIterable<Uint8Array>;
  text: (url: string) => Promise<string | undefined>; // any small file over the same network, undefined on 404
};

// `@openai/codex` → `@openai%2fcodex`, the way registries name a scoped package in a URL.
const encode = (name: string) => name.replace("/", "%2f");

// The registry protocol ctxray needs, over the user's proxy, CA certificates, and credentials.
export const createRegistry = (setup: RegistrySetup, egress: Egress, offline = false): Registry => {
  const through: Egress = { ...egress, ca: [...egress.ca, ...setup.ca] };
  // `missing`: statuses that mean “no such file”. S3 behind a download answers 403 for one it doesn't have.
  const get = async (url: string, accept: string, missing: readonly number[] = []) => {
    if (offline) fail("provision.offline", { url: new URL(url).origin });
    const auth = setup.authOf(url);
    const headers = { accept, ...(auth !== undefined && { authorization: auth }) };
    const response = await fetchThrough(new URL(url), { headers }, through).catch((error: Error) =>
      fail("provision.unreachable", { url: new URL(url).origin, message: error.message }),
    );
    if (missing.includes(response.status)) return undefined;
    if (!response.ok) fail("provision.httpError", { url, status: response.status });
    return response;
  };
  const json = async <T>(url: string, accept: string, missing: readonly number[] = []) =>
    (await (await get(url, accept, missing))?.json()) as T;
  return {
    packument: (name) =>
      json<Packument>(`${setup.registryOf(name)}${encode(name)}`, "application/vnd.npm.install-v1+json"),
    dist: async (name, version) =>
      (
        await json<{ dist: Dist } | undefined>(
          `${setup.registryOf(name)}${encode(name)}/${version}`,
          "application/json",
          [404],
        )
      )?.dist,
    text: async (url) => (await get(url, "text/plain", [403, 404]))?.text(),
    download: async function* (url, onBytes) {
      const response = await get(url, "application/octet-stream");
      if (!response) return;
      const length = Number(response.headers.get("content-length"));
      const total = Number.isFinite(length) && length > 0 ? length : undefined;
      let done = 0;
      if (!response.body) return;
      for await (const chunk of response.body) {
        done += chunk.byteLength;
        onBytes?.(done, total);
        yield chunk;
      }
    },
  };
};
