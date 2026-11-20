import type { RenderChildren } from "claude-code";
import type { Piece, Snapshot, Tab } from "../types";
import { Bar, Gauge, type Kit, Swatch } from "./bar";
import { percent, tokens } from "./format";
import type { Words } from "./i18n";

const TABS: readonly Tab[] = ["overview", "files", "tools", "skills"];

// A list row: tokens right-aligned in a fixed column, the name, and a quiet note at the right edge.
const Row = ({ kit, piece }: { kit: Kit; piece: Piece }) => {
  const { Box, Text } = kit;
  const indent = piece.depth ? `${"  ".repeat(piece.depth - 1)}└ ` : "";
  return (
    <Box flexDirection="row" gap={1}>
      <Text dimColor={piece.isIdle} tabular>
        {(piece.tokens > 0 ? tokens(piece.tokens) : "—").padStart(6)}
      </Text>
      <Box flexGrow={1} flexShrink={1}>
        <Text dimColor={piece.isIdle} wrap="truncate-middle">
          <Text dimColor>{indent}</Text>
          {piece.name}
        </Text>
      </Box>
      {piece.note ? (
        <Text dimColor wrap="truncate-end">
          {piece.note}
        </Text>
      ) : null}
    </Box>
  );
};

// A tab's title line: the share's color and name on the left, its tokens and how many pieces on the right.
const Heading = ({
  kit,
  snapshot,
  names,
  label,
  count,
}: {
  kit: Kit;
  snapshot: Snapshot;
  names: string[];
  label: string;
  count: string;
}) => {
  const { Box, Text } = kit;
  const shares = snapshot.shares.filter((share) => names.includes(share.name));
  const sum = shares.reduce((total, share) => total + share.tokens, 0);
  const first = shares[0] ?? { name: label, tokens: 0, color: "inactive" };
  return (
    <Box flexDirection="row" justifyContent="space-between">
      <Swatch kit={kit} share={first} label={label} />
      <Text dimColor>
        <Text bold>{tokens(sum)}</Text> · {count}
      </Text>
    </Box>
  );
};

const List = ({ kit, pieces, empty }: { kit: Kit; pieces: readonly Piece[]; empty: string }) => {
  const { Box, Text } = kit;
  if (pieces.length === 0) return <Text dimColor>{empty}</Text>;
  return (
    <Box flexDirection="column">
      {pieces.map((piece) => (
        <Row kit={kit} piece={piece} />
      ))}
    </Box>
  );
};

// Every share with a gauge of its part, its tokens, and its percent of what the context holds now.
const Overview = ({
  kit,
  snapshot,
  words,
  columns,
}: {
  kit: Kit;
  snapshot: Snapshot;
  words: Words;
  columns: number;
}) => {
  const { Box, Text } = kit;
  const label = (name: string) => words.share[name] ?? name;
  const nameWidth = Math.max(...snapshot.shares.map((share) => label(share.name).length)) + 2;
  const gauge = Math.max(6, Math.min(24, columns - nameWidth - 16));
  return (
    <Box flexDirection="column">
      {[...snapshot.shares]
        .sort((a, b) => b.tokens - a.tokens)
        .map((share) => (
          <Box flexDirection="row" gap={1}>
            <Box width={nameWidth}>
              <Swatch kit={kit} share={share} label={label(share.name)} />
            </Box>
            <Gauge kit={kit} share={share} whole={snapshot.used} width={gauge} />
            <Text tabular bold>
              {tokens(share.tokens).padStart(6)}
            </Text>
            <Text dimColor tabular>
              {percent(share.tokens, snapshot.used).padStart(4)}
            </Text>
          </Box>
        ))}
    </Box>
  );
};

export const Pane = ({
  kit,
  snapshot,
  words,
  tab,
  columns,
  onTab,
}: {
  kit: Kit;
  snapshot: Snapshot | null;
  words: Words;
  tab: Tab;
  columns: number;
  onTab: (tab: Tab) => void;
}) => {
  const { Box, Text, Button } = kit;
  if (snapshot === null) return <Text dimColor>{words.waiting}</Text>;
  const section = (names: string[], label: string, count: string, list: RenderChildren) => (
    <Box flexDirection="column" gap={1}>
      <Heading kit={kit} snapshot={snapshot} names={names} label={label} count={count} />
      {list}
    </Box>
  );
  const body =
    tab === "files" ? (
      section(
        ["Memory files"],
        words.share["Memory files"] ?? "",
        words.files(snapshot.files.length),
        <List kit={kit} pieces={snapshot.files} empty={words.noFiles} />,
      )
    ) : tab === "tools" ? (
      section(
        ["System tools", "MCP tools"],
        words.tab.tools,
        words.servers(snapshot.servers),
        <List kit={kit} pieces={snapshot.tools} empty={words.noTools} />,
      )
    ) : tab === "skills" ? (
      section(
        ["Skills"],
        words.share["Skills"] ?? "",
        words.skillsListed(snapshot.skillsListed, snapshot.skillsTotal),
        <List kit={kit} pieces={snapshot.skills} empty="" />,
      )
    ) : (
      <Overview kit={kit} snapshot={snapshot} words={words} columns={columns} />
    );
  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column">
        <Box flexDirection="row" justifyContent="space-between">
          <Text bold color="claude">
            Loadout
          </Text>
          <Text bold>
            {words.ofWindow(tokens(snapshot.used), tokens(snapshot.window), percent(snapshot.used, snapshot.window))}
          </Text>
        </Box>
        <Text dimColor>{snapshot.model}</Text>
        <Bar kit={kit} shares={snapshot.shares} width={Math.max(10, Math.min(72, columns - 2))} />
      </Box>
      <Box flexDirection="row" gap={1} flexWrap="wrap">
        {TABS.map((one, i) => (
          <Button
            key={`ctxray-tab-${one}`}
            label={words.tab[one]}
            hotkey={`${i + 1}`}
            variant={one === tab ? "primary" : "secondary"}
            onPress={() => onTab(one)}
          />
        ))}
        <Text dimColor>{words.keys}</Text>
      </Box>
      {body}
      <Text dimColor>{words.footer}</Text>
    </Box>
  );
};
