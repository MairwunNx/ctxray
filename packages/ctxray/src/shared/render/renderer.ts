import type { RendererKind } from "./choose.ts";
import { toPlain } from "./plain.ts";
import type { View } from "./view.ts";

export type Renderer = {
  print: (view: View) => void;
  close: () => Promise<void>;
};

export const createPlainRenderer = (write: (text: string) => void): Renderer => ({
  print: (view) => write(toPlain(view)),
  close: async () => {},
});

// Ink loads only on its own path: it costs 40–75 ms of start-up, which the plain path never pays.
export const createRenderer = async (kind: RendererKind, stdout: NodeJS.WriteStream): Promise<Renderer> => {
  if (kind === "plain") return createPlainRenderer((text) => stdout.write(text));
  const { createInkRenderer } = await import("./ink.tsx");
  return createInkRenderer(stdout);
};
