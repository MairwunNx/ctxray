import type { Snapshot } from "../types";
import { Bar, type Kit, Swatch } from "./bar";
import { percent, tokens } from "./format";
import type { Words } from "./i18n";

// One row above the prompt: what the context is made of, how much of the window it takes, and the way
// into the pane. Narrow terminals keep the bar and the total and drop the legend from the smallest end.
export const Band = ({
  kit,
  snapshot,
  words,
  columns,
  onOpen,
}: {
  kit: Kit;
  snapshot: Snapshot;
  words: Words;
  columns: number;
  onOpen: () => void;
}) => {
  const { Box, Text, Button } = kit;
  const total = `${tokens(snapshot.used)} · ${percent(snapshot.used, snapshot.window)}`;
  const shares = snapshot.shares;
  // ctxray, the bar, the total, the divider, and the button, each with its gap.
  const head = 7 + 13 + total.length + 3 + words.open.length + 5;
  let room = columns - head;
  const legend = shares.filter((share) => {
    const width = (words.short[share.name] ?? share.name).length + tokens(share.tokens).length + 4;
    if (width > room) return false;
    room -= width;
    return true;
  });
  return (
    <Box flexDirection="row" gap={1}>
      <Text bold color="claude">
        ctxray
      </Text>
      <Bar kit={kit} shares={snapshot.shares} width={12} />
      <Text bold>{total}</Text>
      <Text dimColor>│</Text>
      {legend.map((share) => (
        <Text>
          <Swatch kit={kit} share={share} label={words.short[share.name] ?? share.name} />{" "}
          <Text dimColor>{tokens(share.tokens)}</Text>
        </Text>
      ))}
      <Button key="ctxray-open" label={words.open} onPress={onOpen} />
    </Box>
  );
};
