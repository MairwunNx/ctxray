import type { RendererKind } from "./choose.ts";
import { toPlain } from "./plain.ts";
import type { View } from "./view.ts";

export type Renderer = {
  print: (view: View) => void;
  // A status under the printed views that redraws in place, like progress. Plain output skips it: a CI log
  // keeps only what stays.
  live: (view: View | undefined) => void;
  close: () => Promise<void>;
};

export const createPlainRenderer = (write: (text: string) => void): Renderer => ({
  print: (view) => write(toPlain(view)),
  live: () => {},
  close: async () => {},
});

// Ink loads only on its own path: it costs 40–75 ms of start-up, which the plain path never pays.
export const createRenderer = async (kind: RendererKind, stdout: NodeJS.WriteStream): Promise<Renderer> => {
  if (kind === "plain") return createPlainRenderer((text) => stdout.write(text));
  const { createInkRenderer } = await import("./ink.tsx");
  return createInkRenderer(stdout);
};
