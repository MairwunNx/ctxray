import { type FSWatcher, watch } from "node:fs";
import { relative, sep } from "node:path";
import type { Translate } from "#shared/i18n/index.ts";
import { type Renderer, span } from "#shared/render/index.ts";

// What a run writes itself, and what no test reads: a change there starts no run.
const IGNORED = [".git", "node_modules", ".ctxray", "__snapshots__", "__cassettes__"];

export const ignored = (path: string, reportDir: string) => {
  const parts = path.split(sep);
  return parts.some((part) => IGNORED.includes(part)) || path === reportDir || path.startsWith(`${reportDir}${sep}`);
};

type Wake = "change" | "again" | "quit";

// Waits for a file to change, Enter to run again, or q to stop. Changes settle for 300 ms first: an editor
// that saves in steps starts one run.
export const nextRun = (root: string, reportDir: string, renderer: Renderer, t: Translate) =>
  new Promise<Wake>((done) => {
    let timer: Timer | undefined;
    let watcher: FSWatcher | undefined;
    const finish = (wake: Wake) => {
      clearTimeout(timer);
      watcher?.close();
      renderer.keys(undefined);
      process.off("SIGINT", quit);
      done(wake);
    };
    const quit = () => finish("quit");
    watcher = watch(root, { recursive: true }, (_, name) => {
      if (name === null || ignored(relative(root, `${root}${sep}${name}`), reportDir)) return;
      clearTimeout(timer);
      timer = setTimeout(() => finish("change"), 300);
    });
    process.once("SIGINT", quit);
    renderer.keys((key) => {
      if (key === "q") finish("quit");
      if (key === "enter") finish("again");
    });
    renderer.print([[span(` ${t("test.watching")}`, "muted")]]);
  });
