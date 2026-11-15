import { afterAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cassettePath, createCassettes } from "./cassettes.ts";

const dirs: string[] = [];
afterAll(async () => {
  for (const dir of dirs) await rm(dir, { recursive: true, force: true });
});

test("tapes go next to the test file and come back in the next run", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ctxray-cassettes-"));
  dirs.push(dir);
  const file = join(dir, "refunds.ctxray.ts");
  const tape = { version: "2.1.311", model: "claude-sonnet-5-5", entries: [] };
  const first = createCassettes();
  await first.put(file, "claude-code", "refunds › prompt0 #1", tape);
  expect(await first.save()).toBe(1);
  expect(cassettePath(file, "claude-code")).toBe(join(dir, "__cassettes__", "refunds.ctxray.ts.claude-code.json"));
  const second = createCassettes();
  expect(await second.get(file, "claude-code", "refunds › prompt0 #1")).toEqual(tape);
  expect(await second.get(file, "codex", "refunds › prompt0 #1")).toBeUndefined();
  expect(await second.save()).toBe(0);
});
