import type { ElementTable } from "claude-code";
import type { Share } from "../types";
import { cells } from "./format";

// The elements a surface draws with, as `$.ui.resolve(e)` hands them over.
export type Kit = ElementTable;

// What the context is made of, one colored run of cells per share.
export const Bar = ({ kit, shares, width }: { kit: Kit; shares: readonly Share[]; width: number }) => {
  const { Text } = kit;
  const runs = cells(
    shares.map((share) => share.tokens),
    width,
  );
  return (
    <Text>
      {shares.map((share, i) => (
        <Text color={share.color}>{"█".repeat(runs[i] ?? 0)}</Text>
      ))}
    </Text>
  );
};

// A colored square and a name, the legend under the bar.
export const Swatch = ({ kit, share, label }: { kit: Kit; share: Share; label: string }) => {
  const { Text } = kit;
  return (
    <Text>
      <Text color={share.color}>■ </Text>
      {label}
    </Text>
  );
};

// One share's part of the whole as a short gauge: its color, then a quiet track for the rest.
export const Gauge = ({ kit, share, whole, width }: { kit: Kit; share: Share; whole: number; width: number }) => {
  const { Text } = kit;
  const filled = whole > 0 ? Math.max(share.tokens > 0 ? 1 : 0, Math.round((share.tokens / whole) * width)) : 0;
  return (
    <Text>
      <Text color={share.color}>{"█".repeat(filled)}</Text>
      <Text dimColor>{"─".repeat(Math.max(0, width - filled))}</Text>
    </Text>
  );
};
