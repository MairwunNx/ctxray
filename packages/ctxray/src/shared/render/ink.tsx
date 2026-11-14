import { Box, render, Static, Text, type TextProps } from "ink";
import type { Renderer } from "./renderer.ts";
import type { Line, Tone, View } from "./view.ts";

const STYLES: Record<Tone, TextProps> = {
  plain: {},
  strong: { bold: true },
  accent: { color: "cyan" },
  success: { color: "green" },
  failure: { color: "red" },
  warning: { color: "yellow" },
  muted: { dimColor: true },
};

type Printed = { readonly id: number; readonly view: View };

// Printed views never change or reorder, so their positions are stable keys.
const LineText = ({ line }: { line: Line }) => (
  <Text>
    {line.length === 0
      ? " "
      : line.map((part, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: spans of a printed line never move
          <Text key={i} {...STYLES[part.tone]}>
            {part.text}
          </Text>
        ))}
  </Text>
);

const Printed = ({ items }: { items: readonly Printed[] }) => (
  <Static items={[...items]}>
    {(item) => (
      <Box key={item.id} flexDirection="column">
        {item.view.map((line, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: lines of a printed view never move
          <LineText key={i} line={line} />
        ))}
      </Box>
    )}
  </Static>
);

export const createInkRenderer = (stdout: NodeJS.WriteStream): Renderer => {
  let items: readonly Printed[] = [];
  const app = render(<Printed items={items} />, { stdout, patchConsole: false });
  return {
    print: (view) => {
      items = [...items, { id: items.length, view }];
      app.rerender(<Printed items={items} />);
    },
    close: async () => {
      app.unmount();
      await app.waitUntilExit();
    },
  };
};
