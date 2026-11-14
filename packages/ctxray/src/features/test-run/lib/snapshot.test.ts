import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CheckFailure } from "./failure.ts";
import { createSnapshots, describeChange, snapshotFile, snapshotKey } from "./snapshot.ts";

const dir = mkdtempSync(join(tmpdir(), "ctxray-snapshots-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const testFile = join(dir, "payments.ctxray.ts");

const keyOf = (check: () => void) => {
  try {
    check();
    return "matched";
  } catch (error) {
    return (error as CheckFailure).key;
  }
};

test("the key holds the harness and its version", () => {
  expect(snapshotKey("payments › budget", "codex")).toBe("payments › budget › codex@static");
  expect(snapshotKey("budget", "claude-code", "2.1.3")).toBe("budget › claude-code@2.1.3");
  expect(snapshotFile("/repo/tests/payments.ctxray.ts")).toBe("/repo/tests/__snapshots__/payments.ctxray.snap.json");
});

test("a change reads one line per value", () => {
  const before = { rules: { "CLAUDE.md": { tokens: 37 } }, mcp: ["github"] };
  const after = { rules: { "CLAUDE.md": { tokens: 41 }, "AGENTS.md": { tokens: 5 } }, mcp: ["github"] };
  expect(describeChange(before, after).map((line) => line.value)).toEqual([
    "rules › CLAUDE.md › tokens  37 → 41",
    "rules › AGENTS.md › tokens  — → 5",
  ]);
});

describe("a run", () => {
  const value = { rules: { "CLAUDE.md": { tokens: 37 } } };

  test("without --update-snapshots it writes nothing and fails on what's missing", async () => {
    const snapshots = createSnapshots(false);
    await snapshots.load(testFile);
    expect(keyOf(() => snapshots.check(testFile, "a", value))).toBe("snapshot.missing");
    expect(await snapshots.save()).toEqual({ written: 0, updated: 0 });
    expect(await Bun.file(snapshotFile(testFile)).exists()).toBe(false);
  });

  test("--update-snapshots writes, the next run compares", async () => {
    const writing = createSnapshots(true);
    await writing.load(testFile);
    writing.check(testFile, "a", value);
    expect(await writing.save()).toEqual({ written: 1, updated: 0 });

    const reading = createSnapshots(false);
    await reading.load(testFile);
    expect(keyOf(() => reading.check(testFile, "a", value))).toBe("matched");
    expect(keyOf(() => reading.check(testFile, "a", { rules: {} }))).toBe("snapshot.mismatch");
  });
});
