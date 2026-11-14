import type { View } from "./view.ts";

const lineText = (line: View[number]): string =>
  line
    .map((part) => part.text)
    .join("")
    .trimEnd();

// Plain text for CI logs, pipes, and NO_COLOR: no colour, no cursor movement, no trailing spaces.
export const toPlain = (view: View): string => `${view.map(lineText).join("\n")}\n`;
