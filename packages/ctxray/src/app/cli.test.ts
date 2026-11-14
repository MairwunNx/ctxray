import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import { widthOf } from "../shared/render/index.ts";
import { runCli } from "./cli.ts";
import { createContainer } from "./container.ts";
import { VERSION } from "./package-info.ts";

const cwd = mkdtempSync(join(tmpdir(), "ctxray-cli-"));
afterAll(() => rmSync(cwd, { recursive: true, force: true }));

// Runs the CLI against a piped stdout, so it renders plain text.
const run = async (args: string[], env: Record<string, string> = {}) => {
  let stdout = "";
  let stderr = "";
  const out = new Writable({
    write: (chunk, _, done) => {
      stdout += chunk;
      done();
    },
  }) as NodeJS.WriteStream;
  const code = await runCli(
    args,
    { env, stdout: out, stderr: { write: (text) => (stderr += text) } },
    createContainer(env, cwd),
  );
  return { code, stdout, stderr };
};

test("--version prints the version only", async () => {
  expect(await run(["--version"])).toEqual({ code: 0, stdout: `ctxray ${VERSION}\n`, stderr: "" });
});

describe.each([
  ["en", "Commands", "Interface language: en, ru"],
  ["ru", "Команды", "Язык интерфейса: en, ru"],
])("help in %s", (lang, heading, langOption) => {
  test("speaks the language", async () => {
    const { code, stdout } = await run(["--lang", lang]);
    expect(code).toBe(0);
    expect(stdout).toContain(heading);
    expect(stdout).toContain(langOption);
  });

  test("lines option summaries up in one column", async () => {
    const { stdout } = await run(["init", "--help", "--lang", lang]);
    const starts = stdout
      .split("\n")
      .filter((line) => line.startsWith("   ") && line.includes("--"))
      .map((line) => widthOf(line.replace(/^(\s+(-\w, )?--\S+( <\w+>)?\s+).*$/, "$1")));
    expect(starts.length).toBeGreaterThan(5);
    expect(new Set(starts).size).toBe(1);
  });
});

test.each([
  [["frobnicate"], "Unknown command “frobnicate”"],
  [["--frobnicate"], "Unknown option --frobnicate"],
  [["--lang"], "Option --lang needs a value"],
  [["--ci=yes"], "Option --ci takes no value"],
  [["init", "extra"], "Unexpected argument “extra”"],
  [["--version", "--force"], "Unknown option --force"],
])("%p is a usage error", async (args, message) => {
  const { code, stderr } = await run(args);
  expect(code).toBe(2);
  expect(stderr).toStartWith(`ctxray: ${message}\n`);
});

test("errors speak the chosen language", async () => {
  const { stderr } = await run(["frobnicate"], { CTXRAY_LANG: "ru" });
  expect(stderr).toBe("ctxray: Неизвестная команда «frobnicate»\nСписок команд и параметров: ctxray --help\n");
});

test("--lang with a language ctxray lacks warns and goes on in English", async () => {
  const { code, stderr, stdout } = await run(["--lang", "de", "--version"]);
  expect([code, stdout]).toEqual([0, `ctxray ${VERSION}\n`]);
  expect(stderr).toContain("“de”");
});

test("init writes the scaffold, then skips it", async () => {
  const first = await run(["init"]);
  expect(first.code).toBe(0);
  expect(first.stdout).toMatch(/✓ {2}created {2}ctxray\.config\.ts\s/);
  expect(await Bun.file(join(cwd, "ctxray.config.ts")).exists()).toBe(true);
  const second = await run(["init", "--lang=ru"]);
  expect(second.stdout).toMatch(/· {2}пропущен {2}ctxray\.config\.ts\s+уже есть, --force перезапишет/);
});
