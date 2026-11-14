import { realpath } from "node:fs/promises";
import { findRoot } from "#entities/harness/index.ts";
import type { Config } from "#entities/user-config/index.ts";
import type { HarnessId, LoadoutSnapshot } from "#shared/contract/index.ts";
import type { Env } from "#shared/infra/index.ts";
import { createCapture } from "./lib/capture.ts";
import { createSession } from "./lib/session.ts";
import { createWorkspaces } from "./lib/workspace.ts";

// The first request one build of a harness sends for the project, on the mock model: what `ctxray harness
// upgrade` compares between the version in ctxray.lock and the next one.
export const createStartingLoadout =
  (config: Config, env: Env, cwd: string, self: readonly string[]) =>
  async (harness: HarnessId, binary: string): Promise<LoadoutSnapshot> => {
    const { root } = await findRoot(await realpath(cwd));
    const workspace = await createWorkspaces()(root);
    const capture = createCapture({ config, env, self, binaries: async () => binary });
    const scope = { harness, workspace, inventory: await workspace.inventoryOf(harness), snapshot: () => {} };
    const session = createSession(capture, scope);
    try {
      return (await session.firstRequest()).snapshot;
    } finally {
      await session.end().catch(() => {});
      await capture.stop(false);
    }
  };
createStartingLoadout.inject = ["config", "env", "cwd", "self"] as const;
export type StartingLoadout = ReturnType<typeof createStartingLoadout>;
