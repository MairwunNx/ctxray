import { ProvisionFailure, packHarnesses } from "#entities/harness-cache/index.ts";
import { readLockfile } from "#entities/lockfile/index.ts";
import type { Config } from "#entities/user-config/index.ts";
import { type Env, PLATFORMS, platformKey } from "#shared/infra/index.ts";
import { openHarnessContext } from "./lib/context.ts";

export type PackRequest = { output: string; platforms: readonly string[] | "all" | undefined };

// `ctxray harness pack`: the builds ctxray.lock pins, for this platform or the ones asked, in one archive that
// `ctxray harness install --from` takes on a machine without a registry.
export const createHarnessPackAction = (config: Config, env: Env, cwd: string) => async (request: PackRequest) => {
  const context = await openHarnessContext(config, env, cwd);
  const lock = await readLockfile(context.lockPath);
  if (!lock) throw new ProvisionFailure("harness.noLockfile", { file: context.lockPath });
  const platforms =
    request.platforms === "all"
      ? PLATFORMS.map(platformKey)
      : (request.platforms ?? [platformKey(context.provisioning.platform)]);
  const files = await packHarnesses(lock, platforms, await context.provisioning.source());
  const bytes = await new Bun.Archive(files).bytes();
  await Bun.write(request.output, bytes);
  return { output: request.output, builds: Object.keys(files).length - 1, size: bytes.byteLength, platforms };
};
createHarnessPackAction.inject = ["config", "env", "cwd"] as const;
export type HarnessPackAction = ReturnType<typeof createHarnessPackAction>;
