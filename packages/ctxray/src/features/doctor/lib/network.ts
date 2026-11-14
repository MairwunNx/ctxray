import { readRegistrySetup } from "#entities/harness-cache/index.ts";
import type { NetworkSettings } from "#entities/user-config/index.ts";
import { type Egress, type Env, fetchThrough } from "#shared/infra/index.ts";
import { check, type DoctorCheck } from "./model.ts";

// A proxy URL without its password: doctor output lands in CI logs.
export const withoutCredentials = (url: string) => {
  try {
    const parsed = new URL(url);
    if (parsed.username === "" && parsed.password === "") return url;
    parsed.username = "***";
    parsed.password = "";
    return parsed.toString();
  } catch {
    return url;
  }
};

// Bun reads NO_PROXY its own way: `*.corp.com` and CIDR ranges don't match what they do in curl (ADR 0003).

export const proxyChecks = (network: NetworkSettings, env: Env): DoctorCheck[] => {
  const checks: DoctorCheck[] = [];
  const proxy = network.httpsProxy ?? network.httpProxy;
  checks.push(
    proxy ? check("ok", "doctor.proxy", { proxy: withoutCredentials(proxy) }) : check("info", "doctor.noProxy"),
  );
  if (!env["HTTPS_PROXY"] && !env["https_proxy"] && (env["HTTP_PROXY"] || env["http_proxy"])) {
    checks.push(check("warning", "doctor.httpOnlyProxy"));
  }
  for (const entry of network.noProxy) {
    if (entry.startsWith("*.")) checks.push(check("warning", "doctor.noProxyEntry", { entry, fix: entry.slice(1) }));
    if (/\/\d+$/.test(entry)) checks.push(check("warning", "doctor.noProxyCidr", { entry }));
  }
  return checks;
};

export const caChecks = async (network: NetworkSettings): Promise<DoctorCheck[]> => {
  const checks: DoctorCheck[] = [];
  for (const file of network.caFiles) {
    const text = await Bun.file(file)
      .text()
      .catch(() => undefined);
    if (text === undefined) checks.push(check("error", "doctor.caMissing", { file }));
    else if (!text.includes("BEGIN CERTIFICATE")) checks.push(check("error", "doctor.caNotPem", { file }));
    else checks.push(check("ok", "doctor.ca", { file }));
  }
  if (network.systemCa) checks.push(check("info", "doctor.systemCa"));
  return checks;
};

// The registry harnesses install from, and whether it answers at all: any HTTP status means the network,
// the proxy, and TLS work, a thrown error means one of them doesn't.
export const registryChecks = async (
  project: string,
  env: Env,
  configured: string | undefined,
  egress: Egress,
  offline: boolean,
): Promise<DoctorCheck[]> => {
  const setup = await readRegistrySetup(project, env, configured);
  const registry = setup.registryOf("@openai/codex");
  const checks = [check("ok", "doctor.registry", { registry: withoutCredentials(registry) })];
  if (setup.ca.length > 0) checks.push(check("ok", "doctor.npmrcCa", { count: setup.ca.length }));
  if (offline) return [...checks, check("info", "doctor.offline")];
  const auth = setup.authOf(registry);
  const response = await fetchThrough(
    new URL(registry),
    { headers: auth ? { authorization: auth } : {}, signal: AbortSignal.timeout(10_000) },
    { ...egress, ca: [...egress.ca, ...setup.ca] },
  ).catch((error: Error) => error);
  if (response instanceof Error)
    return [...checks, check("error", "doctor.registryDown", { message: response.message })];
  return [...checks, check(response.status < 500 ? "ok" : "warning", "doctor.registryUp", { status: response.status })];
};
