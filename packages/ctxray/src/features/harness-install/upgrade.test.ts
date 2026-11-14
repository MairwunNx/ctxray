import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";
import { finalizeConfig } from "#entities/user-config/index.ts";
import { codexBuilds, startFakeRegistry } from "#fixtures/registry/fake-registry.ts";
import type { LoadoutSnapshot } from "#shared/contract/index.ts";
import { createHarnessAddAction } from "./add.action.ts";
import { createHarnessUpgradeAction, type StartingLoadout } from "./upgrade.action.ts";

const root = mkdtempSync(join(tmpdir(), "ctxray-upgrade-"));
const registry = await startFakeRegistry([...codexBuilds("0.168.0"), ...codexBuilds("0.169.0")]);
afterAll(() => {
  registry.stop();
  rmSync(root, { recursive: true, force: true });
});

// The loadout each build "sends": its version decides the size of the base prompt.
const startingLoadout: StartingLoadout = async (harness, binary) => {
  const version = (await $`${binary}`.text()).split(" ")[0] ?? "";
  const tokens = version === "0.169.0" ? 5100 : 5000;
  return {
    schemaVersion: 1,
    harness: { name: harness, version },
    mode: "capture",
    system: [{ id: "system:base", title: "Base prompt", tokens }],
    rules: [],
    skills: { listed: [], loaded: [] },
    mcp: { servers: [], tools: [] },
    commands: [],
    tokens: { total: tokens, byComponent: { system: tokens }, byMcpServer: {}, exact: false, method: "local" },
    provenance: {},
  } satisfies LoadoutSnapshot;
};

const setup = async () => {
  mkdirSync(join(root, "home"), { recursive: true });
  writeFileSync(join(root, ".npmrc"), `registry=${registry.url}\n`);
  const env = { PATH: process.env["PATH"] ?? "", HOME: join(root, "home"), CTXRAY_CACHE_DIR: join(root, "cache") };
  const config = finalizeConfig({}, env, []);
  await createHarnessAddAction(config, env, root)(["codex@0.168.x"]);
  return createHarnessUpgradeAction(config, env, root, startingLoadout);
};

test("upgrade shows the loadout diff, and only a real run writes the lockfile", async () => {
  const upgrade = await setup();
  const events = new Set<string>();
  const dry = await upgrade(["codex@0.169.x"], true, (event) => events.add(event.kind));
  const [codex] = dry.upgrades;
  expect([codex?.before.version, codex?.after.version]).toEqual(["0.168.0", "0.169.0"]);
  expect(codex?.diff?.changes).toEqual([{ component: "system", id: "Base prompt", before: 5000, after: 5100 }]);
  expect([...events]).toEqual(["install", "capture"]);
  expect(await Bun.file(join(root, "ctxray.lock")).text()).toContain('"version": "0.168.0"');
  await upgrade(["codex@0.169.x"], false);
  expect(await Bun.file(join(root, "ctxray.lock")).text()).toContain('"version": "0.169.0"');
  const again = await upgrade(["codex"], false);
  expect([again.upgrades[0]?.after.version, again.upgrades[0]?.diff]).toEqual(["0.169.0", undefined]);
});

test("a harness the lockfile doesn't pin can't be upgraded", async () => {
  const upgrade = await setup();
  await expect(upgrade(["claude-code"], true)).rejects.toMatchObject({ key: "lock.missing" });
});
