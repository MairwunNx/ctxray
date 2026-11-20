import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createSpectateHooksAction } from "../install.action.ts";
import { runSpectateHook } from "./hook.ts";
import { hooksFile } from "./places.ts";

const dir = mkdtempSync(join(tmpdir(), "ctxray-opencode-plugin-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const env = { HOME: dir, XDG_CONFIG_HOME: join(dir, "config"), CTXRAY_STATE_DIR: join(dir, "state") };
const hooks = createSpectateHooksAction(env, ["ctxray"]);
const file = hooksFile("opencode", env, dir);

test("the plugin goes among OpenCode's global ones, once, and comes out again", async () => {
  expect(file).toBe(join(dir, "config", "opencode", "plugin", "ctxray-spectate.ts"));
  const [added] = await hooks.install(["opencode"]);
  expect(added).toMatchObject({ family: "opencode", events: ["experimental.chat.system.transform"] });
  expect(await Bun.file(file).text()).toContain('"__spectate-hook","opencode"');
  expect((await hooks.install(["opencode"]))[0]).toMatchObject({ events: [] });
  expect((await hooks.uninstall(["opencode"]))[0]).toMatchObject({ events: ["experimental.chat.system.transform"] });
  expect(await Bun.file(file).exists()).toBe(false);
});

test("a plugin of the same name that isn't ctxray's stays as it is", async () => {
  await Bun.write(file, "export const Mine = async () => ({});\n");
  expect((await hooks.install(["opencode"]))[0]).toMatchObject({ error: "not ctxray's plugin" });
  expect((await hooks.uninstall(["opencode"]))[0]).toMatchObject({ events: [] });
  expect(await Bun.file(file).text()).toContain("Mine");
  rmSync(dirname(file), { recursive: true });
});

test("the system prompt the plugin sends is kept per session, secrets redacted", async () => {
  const token = ["ghp", "_", "A".repeat(36)].join("");
  const state = join(dir, "state", "spectate");
  const payload = { session_id: "ses_1", system: [`You are OpenCode.\nInstructions from: AGENTS.md\nUse ${token}.`] };
  expect(await runSpectateHook(["opencode", state], JSON.stringify(payload), {})).toBe(0);
  const kept = await Bun.file(join(state, "opencode", "ses_1.json")).text();
  expect(kept).toContain("Instructions from: AGENTS.md");
  expect(kept).not.toContain(token);
  writeFileSync(join(state, "bad"), "");
  expect(await runSpectateHook(["opencode", state], JSON.stringify({ session_id: "../x", system: [] }), {})).toBe(0);
  expect(await Bun.file(join(state, "x.json")).exists()).toBe(false);
});
