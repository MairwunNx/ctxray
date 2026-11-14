import { Box, type Instance, render, Static, Text, type TextProps } from "ink";
import { useEffect, useState } from "react";
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
const LineText = ({ line, truncate }: { line: Line; truncate?: boolean }) => (
  <Text {...(truncate ? { wrap: "truncate-end" as const } : {})}>
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

const Lines = ({ view, truncate }: { view: View; truncate?: boolean }) => (
  <Box flexDirection="column">
    {view.map((line, i) => (
      // biome-ignore lint/suspicious/noArrayIndexKey: a view's lines redraw as a whole
      <LineText key={i} line={line} {...(truncate ? { truncate } : {})} />
    ))}
  </Box>
);

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

const Spinner = () => {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setFrame((at) => (at + 1) % FRAMES.length), 80);
    return () => clearInterval(timer);
  }, []);
  return <Text color="cyan">{FRAMES[frame]}</Text>;
};

type Screen = { items: readonly Printed[]; live: View | undefined };

const Screen = ({ items, live }: Screen) => (
  <>
    <Static items={[...items]}>{(item) => <Lines key={item.id} view={item.view} />}</Static>
    {live && (
      <Box>
        <Text> </Text>
        <Spinner />
        {/* A status that wraps would leave its second line behind on the next redraw. */}
        <Lines view={live} truncate />
      </Box>
    )}
  </>
);

// Ink starts on the first output: an empty first frame would leave a blank line behind.
export const createInkRenderer = (stdout: NodeJS.WriteStream): Renderer => {
  let screen: Screen = { items: [], live: undefined };
  let app: Instance | undefined;
  const draw = (next: Screen) => {
    screen = next;
    if (app) app.rerender(<Screen {...screen} />);
    else app = render(<Screen {...screen} />, { stdout, patchConsole: false });
  };
  return {
    print: (view) => draw({ ...screen, items: [...screen.items, { id: screen.items.length, view }] }),
    live: (view) => {
      if (app || view) draw({ ...screen, live: view });
    },
    close: async () => {
      app?.unmount();
      await app?.waitUntilExit();
    },
  };
};
