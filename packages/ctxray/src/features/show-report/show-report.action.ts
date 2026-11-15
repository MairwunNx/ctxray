import { watch } from "node:fs";
import { join } from "node:path";
import { Elysia } from "elysia";
import { toHtml } from "#entities/report/index.ts";
import { Report } from "#shared/contract/index.ts";

export type ShownReport = { url: string; stop: () => Promise<void> };

export class NoReport extends Error {}

const readReport = async (file: string) => {
  const handle = Bun.file(file);
  if (!(await handle.exists())) throw new NoReport(file);
  return Report.parse(await handle.json());
};

// The HTML report, served from the folder's report.json: a run that writes a new one reloads every open page.
// Only this machine reaches it.
export const createShowReportAction =
  () =>
  async (dir: string, port = 0): Promise<ShownReport> => {
    const file = join(dir, "report.json");
    await readReport(file);
    const listeners = new Set<(event: string) => void>();
    let timer: Timer | undefined;
    // A write lands in a few chunks: one reload once it settles.
    const watcher = watch(dir, (_, name) => {
      if (name !== "report.json") return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        for (const listener of listeners) listener("reload");
      }, 200);
    });
    const events = () =>
      new Response(
        new ReadableStream({
          start: (controller) => {
            const send = (event: string) => controller.enqueue(`event: ${event}\ndata: {}\n\n`);
            controller.enqueue(": ctxray\n\n");
            listeners.add(send);
          },
          cancel: () => {},
        }),
        { headers: { "content-type": "text/event-stream", "cache-control": "no-cache" } },
      );
    const app = new Elysia()
      .get(
        "/",
        async () =>
          new Response(await toHtml(await readReport(file)), {
            headers: { "content-type": "text/html; charset=utf-8" },
          }),
      )
      .get("/report.json", () => new Response(Bun.file(file)))
      .get("/events", events);
    app.listen({ hostname: "127.0.0.1", port });
    return {
      url: `http://127.0.0.1:${app.server?.port}/`,
      stop: async () => {
        watcher.close();
        listeners.clear();
        await app.stop(true);
      },
    };
  };
export type ShowReportAction = ReturnType<typeof createShowReportAction>;
