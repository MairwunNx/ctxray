import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";
import { claudeBuilds, codexBuilds, startFakeRegistry } from "#fixtures/registry/fake-registry.ts";
import { DIRECT, type Platform } from "#shared/infra/index.ts";
import { createHarnessCache, type Progress } from "./install.ts";
import { listCache, pruneCache } from "./inventory.ts";
import { readRegistrySetup } from "./npmrc.ts";
import { archiveSource, packHarnesses, registrySource } from "./pack.ts";
import { createRegistry } from "./registry.ts";
import { resolveHarness } from "./resolve.ts";

const root = mkdtempSync(join(tmpdir(), "ctxray-cache-"));
const fake = await startFakeRegistry([...claudeBuilds("2.1.311"), ...codexBuilds("0.169.0")]);
afterAll(() => {
  fake.stop();
  rmSync(root, { recursive: true, force: true });
});

const registry = createRegistry(await readRegistrySetup(root, {}, fake.url, root), DIRECT);
const source = registrySource(registry);
const claude = await resolveHarness(registry, "claude-code", "2.1.311");
const codex = await resolveHarness(registry, "codex", "0.169.0");
const LINUX: Platform = { os: "linux", arch: "x64", libc: "glibc" };
const here: Platform = {
  os: process.platform,
  arch: process.arch,
  ...(process.platform === "linux" && { libc: "glibc" as const }),
};

let count = 0;
const cacheIn = (...names: string[]) => {
  const dirs = names.map((name) => join(root, `${name}-${++count}`));
  for (const dir of dirs) mkdirSync(dir, { recursive: true });
  return { write: dirs[0] as string, all: dirs };
};

describe("the harness cache", () => {
  test("installs a build, runs it, and finds it again without a download", async () => {
    const dirs = cacheIn("one");
    const cache = createHarnessCache(dirs);
    const before = fake.downloads.length;
    const phases = new Set<Progress["phase"]>();
    const installed = await cache.install("claude-code", claude, here, source, (progress) =>
      phases.add(progress.phase),
    );
    expect((await $`${installed.binary}`.text()).trim()).toBe("2.1.311 (fake)");
    expect(installed.dir).toContain(`claude-code/2.1.311+${installed.platform}+`);
    expect([...phases]).toEqual(["download", "unpack"]);
    expect(await cache.find("claude-code", claude, here)).toMatchObject({ binary: installed.binary, shared: false });
    expect(fake.downloads.length - before).toBe(1);
  });

  test("finds the Codex executable where its package says", async () => {
    const installed = await createHarnessCache(cacheIn("codex")).install("codex", codex, LINUX, source);
    expect(installed.bin).toBe("vendor/triple/bin/codex");
    expect(installed.package).toBe("@openai/codex@0.169.0-linux-x64");
  });

  test("parallel installs of one build download it once and both succeed", async () => {
    const dirs = cacheIn("parallel");
    const before = fake.downloads.length;
    const waits: string[] = [];
    const runs = [0, 1, 2].map((index) =>
      createHarnessCache(dirs).install("claude-code", claude, LINUX, source, (progress) => {
        if (progress.phase === "waiting") waits.push(String(index));
      }),
    );
    const installed = await Promise.all(runs);
    expect(new Set(installed.map((one) => one.dir)).size).toBe(1);
    expect(fake.downloads.length - before).toBe(1);
    expect(waits.length).toBeGreaterThan(0);
    expect((await listCache(dirs)).map((build) => build.version)).toEqual(["2.1.311"]);
  });

  test("a tarball that doesn't match ctxray.lock never lands in the cache", async () => {
    const broken = await startFakeRegistry(claudeBuilds("2.1.311"), { corrupt: true });
    const dirs = cacheIn("corrupt");
    const corrupt = registrySource(createRegistry(await readRegistrySetup(root, {}, broken.url, root), DIRECT));
    await expect(createHarnessCache(dirs).install("claude-code", claude, LINUX, corrupt)).rejects.toThrow(
      "doesn't match ctxray.lock",
    );
    broken.stop();
    expect(await listCache(dirs)).toEqual([]);
    expect(await Array.fromAsync(new Bun.Glob("tmp/*").scan({ cwd: dirs.write, onlyFiles: false }))).toEqual([]);
  });

  test("a read-only layer serves builds and the writable one takes new installs", async () => {
    const shared = cacheIn("shared");
    await createHarnessCache(shared).install("claude-code", claude, LINUX, source);
    const layered = { write: join(root, `local-${++count}`), all: [join(root, `local-${count}`), ...shared.all] };
    const found = await createHarnessCache(layered).find("claude-code", claude, LINUX);
    expect(found?.shared).toBe(true);
    const listed = await listCache(layered);
    expect(listed.map((build) => build.shared)).toEqual([true]);
    expect(await pruneCache(layered, { keep: () => false, olderThan: 0 })).toEqual([]);
  });

  test("prune drops what the project doesn't lock and keeps what it does", async () => {
    const dirs = cacheIn("prune");
    const cache = createHarnessCache(dirs);
    await cache.install("claude-code", claude, LINUX, source);
    await cache.install("codex", codex, LINUX, source);
    const removed = await pruneCache(dirs, { keep: (build) => build.harness === "codex", olderThan: 0 });
    expect(removed.map((build) => build.harness)).toEqual(["claude-code"]);
    expect((await listCache(dirs)).map((build) => build.harness)).toEqual(["codex"]);
    expect(await pruneCache(dirs, { keep: () => false, olderThan: 86_400_000 })).toEqual([]);
  });

  test("a packed archive installs without the registry", async () => {
    const lock = { lockfileVersion: 1 as const, harnesses: { "claude-code": claude, codex } };
    const files = await packHarnesses(lock, ["linux-x64-glibc"], source);
    const archive = join(root, "harnesses.tar");
    await Bun.write(archive, await new Bun.Archive(files).bytes());
    const before = fake.downloads.length;
    const offline = await archiveSource(archive);
    const installed = await createHarnessCache(cacheIn("offline")).install("codex", codex, LINUX, offline);
    expect(installed.version).toBe("0.169.0");
    expect(fake.downloads.length).toBe(before);
  });
});
