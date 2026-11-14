import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";
import { finalizeConfig } from "#entities/user-config/index.ts";
import { claudeBuilds, startFakeRegistry } from "#fixtures/registry/fake-registry.ts";
import type { UserConfig } from "#shared/contract/index.ts";
import { createBinaries } from "./binaries.ts";

const root = mkdtempSync(join(tmpdir(), "ctxray-binaries-"));
const registry = await startFakeRegistry(claudeBuilds("2.1.311"));
afterAll(() => {
  registry.stop();
  rmSync(root, { recursive: true, force: true });
});

// A `claude` on PATH that isn't the pinned one.
const bin = join(root, "bin");
mkdirSync(bin);
writeFileSync(join(bin, "claude"), "#!/bin/sh\necho 'from PATH'\n", { mode: 0o755 });

let count = 0;
const setup = async (config: UserConfig, locked: boolean) => {
  const dir = join(root, `project-${++count}`);
  mkdirSync(dir);
  writeFileSync(join(dir, ".npmrc"), `registry=${registry.url}\n`);
  const env = { PATH: bin, HOME: dir, CTXRAY_CACHE_DIR: join(dir, "cache") };
  if (locked) {
    const add = Bun.spawn(
      [process.execPath, join(import.meta.dir, "../../../app/main.ts"), "harness", "add", "claude-code@2.1.311"],
      {
        cwd: dir,
        env: { ...env, PATH: `${bin}:${process.env["PATH"]}` },
      },
    );
    expect(await add.exited).toBe(0);
  }
  return { dir, env, finalized: finalizeConfig(config, env, []) };
};

const run = async (binary: string | undefined) =>
  binary === undefined ? undefined : (await $`${binary}`.text()).trim();

test("a pinned harness comes from the cache, installed on first use", async () => {
  const { dir, env, finalized } = await setup({}, true);
  const phases: string[] = [];
  const binaries = createBinaries(finalized, env, dir, {
    frozen: true,
    install: true,
    onInstall: (_, progress) => phases.push(progress.phase),
  });
  expect(await run(await binaries("claude-code"))).toBe("2.1.311 (fake)");
  expect(phases).toContain("download");
});

test("--no-install fails on a pinned harness the cache lacks", async () => {
  const { dir, env, finalized } = await setup({}, true);
  const binaries = createBinaries(finalized, env, dir, { frozen: false, install: false, onInstall: () => {} });
  await expect(binaries("claude-code")).rejects.toMatchObject({ key: "provision.notInstalled" });
});

test("without a lockfile a local run takes PATH and a frozen one fails", async () => {
  const { dir, env, finalized } = await setup({}, false);
  const local = createBinaries(finalized, env, dir, { frozen: false, install: true, onInstall: () => {} });
  expect(await run(await local("claude-code"))).toBe("from PATH");
  const frozen = createBinaries(finalized, env, dir, { frozen: true, install: true, onInstall: () => {} });
  await expect(frozen("claude-code")).rejects.toMatchObject({ key: "lock.missing" });
});

test("`source: system` takes PATH even with a pin", async () => {
  const { dir, env, finalized } = await setup({ harnesses: { "claude-code": { source: "system" } } }, false);
  const binaries = createBinaries(finalized, env, dir, { frozen: false, install: true, onInstall: () => {} });
  expect(await run(await binaries("claude-code"))).toBe("from PATH");
});
