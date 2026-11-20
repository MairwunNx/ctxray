import type { EngineInterface, Register } from "claude-code";
import { atom, read, update } from "claude-code";
import type { Snapshot, Tab } from "../types";
import { Band } from "./band";
import { languageOf } from "./format";
import { wordsFor } from "./i18n";
import { Pane } from "./pane";
import { toSnapshot } from "./snapshot";

// The Loadout of this session above the prompt and in a pane, counted by Claude Code itself.
// Claude Code before 2.1.286 skips this module and keeps running the plugin's command hooks.
// Imports here go without extensions, unlike in ctxray's own code: Claude Code's checker for plugin modules
// refuses a `.ts` in a path.
const PANE = "ctxray-loadout";
const snapshot = atom({ plugin: "ctxray", key: "snapshot" } as const, null as Snapshot | null, { shape: "snapshot-1" });
const imports = atom({ plugin: "ctxray", key: "imports" } as const, {} as Record<string, string>, {
  shape: "imports-1",
});
const usedSkills = atom({ plugin: "ctxray", key: "usedSkills" } as const, [] as string[], { shape: "skills-1" });
const tab = atom({ plugin: "ctxray", key: "tab" } as const, "overview" as Tab);
const cwd = atom({ plugin: "ctxray", key: "cwd" } as const, "");
const home = atom({ plugin: "ctxray", key: "home" } as const, "");
const lang = atom({ plugin: "ctxray", key: "lang" } as const, "en");

// Reads Claude Code's own count of the context and keeps it for the band and the pane.
async function refresh($: EngineInterface) {
  const usage = await $.session.usage({ breakdown: "full" });
  const words = wordsFor(await read($, lang));
  const next = toSnapshot({
    usage,
    imports: await read($, imports),
    used: await read($, usedSkills),
    cwd: await read($, cwd),
    home: await read($, home),
    words,
  });
  if (next) await update($, snapshot, () => next);
}

export const register: Register = (on) => {
  on("session.start", async ($, e, next) => {
    // The same order of sources as the ctxray CLI: its own variable first, then the system's.
    const env = [
      await $.env.get("CTXRAY_LANG"),
      await $.env.get("LC_ALL"),
      await $.env.get("LC_MESSAGES"),
      await $.env.get("LANG"),
    ];
    const found = env.map(languageOf).find((value) => value !== undefined);
    await update($, lang, () => (found === "ru" ? "ru" : "en"));
    await update($, cwd, () => e.cwd);
    await update($, home, () => "");
    const homeDir = await $.env.get("HOME");
    if (homeDir) await update($, home, () => homeDir);
    await $.command.register({ name: PANE, description: wordsFor(await read($, lang)).title });
    return next(e);
  });

  on("session.measure", async ($, e, next) => {
    const result = await next(e);
    await refresh($);
    return result;
  });

  on("command.run", { command: PANE }, async ($) => {
    await $.ui.open({ id: PANE, title: wordsFor(await read($, lang)).title, focus: true, closeOnEscape: true });
    await refresh($);
    return {};
  });

  // Which file's `@` brought each instruction file: /context lists the files, not the chain.
  on("prompt.context", async ($, e, next) => {
    const result = await next(e);
    const files = result.instructionFiles ?? e.instructionFiles ?? [];
    const chain = Object.fromEntries(files.flatMap((file) => (file.parent ? [[file.path, file.parent]] : [])));
    await update($, imports, () => chain);
    return result;
  });

  on("skill.prompt", async ($, e, next) => {
    const result = await next(e);
    await update($, usedSkills, (list) => (list.includes(e.skill) ? list : [...list, e.skill]));
    return result;
  });

  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    const current = await read($, snapshot);
    if (e.props.hasSurvey || e.props.isCollapsed || current === null) return next(e);
    const words = wordsFor(await read($, lang));
    return (
      <Band
        kit={$.ui.resolve(e)}
        snapshot={current}
        words={words}
        columns={e.props.bodyColumns}
        onOpen={() => $.ui.open({ id: PANE, title: words.title, focus: true, closeOnEscape: true })}
      />
    );
  });

  on("ui.render", { component: "Pane", requestId: PANE }, async ($, e) => (
    <Pane
      kit={$.ui.resolve(e)}
      snapshot={await read($, snapshot)}
      words={wordsFor(await read($, lang))}
      tab={await read($, tab)}
      columns={e.props.bodyColumns}
      onTab={(one) => update($, tab, () => one)}
    />
  ));
};
