import type { RendererKind } from "./choose.ts";
import { toPlain } from "./plain.ts";
import type { View } from "./view.ts";

export type Renderer = {
  print: (view: View) => void;
  // A status under the printed views that redraws in place, like progress. Plain output skips it: a CI log
  // keeps only what stays.
  live: (view: View | undefined) => void;
  // Keys the user presses while a command waits, like `q` in watch mode. Undefined stops listening. Plain
  // output has no keys: Ctrl+C still ends the process.
  keys: (onKey: ((key: string) => void) | undefined) => void;
  close: () => Promise<void>;
};

export const createPlainRenderer = (write: (text: string) => void): Renderer => ({
  print: (view) => write(toPlain(view)),
  live: () => {},
  keys: () => {},
  close: async () => {},
});

// Ink loads only on its own path: it costs 40–75 ms of start-up, which the plain path never pays.
export const createRenderer = async (kind: RendererKind, stdout: NodeJS.WriteStream): Promise<Renderer> => {
  if (kind === "plain") return createPlainRenderer((text) => stdout.write(text));
  const { createInkRenderer } = await import("./ink.tsx");
  return createInkRenderer(stdout);
};
