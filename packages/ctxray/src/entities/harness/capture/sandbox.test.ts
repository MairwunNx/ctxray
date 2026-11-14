import { expect, test } from "bun:test";
import { sandboxed, sandboxProfile } from "./sandbox.ts";

test("the profile lets the run write only into its own folder", () => {
  expect(sandboxProfile("/tmp/run")).toContain('(subpath "/tmp/run")');
  expect(sandboxProfile("/tmp/run")).toContain("(deny file-write*");
});

test("only macOS gets sandbox-exec", () => {
  expect(sandboxed(["claude", "-p"], "/tmp/run", "linux")).toEqual(["claude", "-p"]);
  if (process.platform === "darwin") expect(sandboxed(["claude"], "/r", "darwin")[0]).toEndWith("sandbox-exec");
});

test.skipIf(process.platform !== "darwin")("a write outside the run folder fails", async () => {
  const outside = `${process.env["HOME"]}/ctxray-sandbox-probe-${process.pid}`;
  const probe = Bun.spawn(sandboxed(["sh", "-c", `echo x > ${outside}`], "/private/tmp/ctxray-nothing"), {
    stderr: "pipe",
  });
  expect(await probe.exited).not.toBe(0);
  expect(await Bun.file(outside).exists()).toBe(false);
});
