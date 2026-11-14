import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withFileLock } from "./file-lock.ts";

const root = mkdtempSync(join(tmpdir(), "ctxray-lock-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

test("holders take turns", async () => {
  const path = join(root, "turns.lock");
  const log: string[] = [];
  const hold = (name: string) =>
    withFileLock(path, async () => {
      log.push(`${name} in`);
      await Bun.sleep(30);
      log.push(`${name} out`);
    });
  await Promise.all([hold("a"), hold("b"), hold("c")]);
  for (let index = 0; index < log.length; index += 2) {
    expect(log[index + 1]).toBe(log[index]?.replace(" in", " out"));
  }
});

test("another process waits for the lock", async () => {
  const path = join(root, "process.lock");
  const marks = join(root, "marks");
  const script = `
    const { withFileLock } = await import(${JSON.stringify(join(import.meta.dir, "file-lock.ts"))});
    const { appendFileSync } = await import("node:fs");
    await withFileLock(${JSON.stringify(path)}, async () => {
      appendFileSync(${JSON.stringify(marks)}, "in\\n");
      await Bun.sleep(150);
      appendFileSync(${JSON.stringify(marks)}, "out\\n");
    });`;
  const runs = [0, 1].map(() => Bun.spawn([process.execPath, "-e", script], { stderr: "inherit" }).exited);
  expect(await Promise.all(runs)).toEqual([0, 0]);
  expect(await Bun.file(marks).text()).toBe("in\nout\nin\nout\n");
});

test("a lock nobody keeps alive is taken over", async () => {
  const path = join(root, "stale.lock");
  mkdirSync(path);
  const old = new Date(Date.now() - 60_000);
  utimesSync(path, old, old);
  let waited = false;
  const value = await withFileLock(path, async () => "mine", { stale: 1_000, onWait: () => (waited = true) });
  expect(value).toBe("mine");
  expect(waited).toBe(false);
});

test("a held lock makes the next one wait and say so", async () => {
  const path = join(root, "held.lock");
  let waits = 0;
  const first = withFileLock(path, () => Bun.sleep(50));
  await Bun.sleep(5);
  await withFileLock(path, async () => {}, { onWait: () => waits++ });
  await first;
  expect(waits).toBe(1);
});
