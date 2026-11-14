// Cursor reads an .mdc rule's frontmatter line by line, not as YAML (its local build, 2026.11): `globs: *.ts`
// works there although YAML rejects it. `true` and `false` turn into booleans, quotes come off, and a key
// with nothing after it takes the `- item` lines below it as a list.
const scalarOf = (raw: string): string | boolean => {
  const text = raw.trim();
  if (text === "true") return true;
  if (text === "false") return false;
  const quoted = (text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"));
  return quoted ? text.slice(1, -1) : text;
};

export type CursorFrontmatter = { data: Record<string, string | boolean | string[]>; body: string };

export const cursorFrontmatter = (text: string): CursorFrontmatter => {
  const start = text.trimStart();
  const parts = start.split("---").filter(Boolean);
  if (!start.startsWith("---") || parts.length < 2) return { data: {}, body: text };
  const data: CursorFrontmatter["data"] = {};
  let list: string | undefined;
  for (const line of (parts[0] ?? "").trim().split("\n")) {
    const item = /^\s+-\s+(.*)$/.exec(line.replace(/\r$/, ""));
    const current = list === undefined ? undefined : data[list];
    if (item && Array.isArray(current)) {
      current.push(String(scalarOf(item[1] ?? "")));
      continue;
    }
    list = undefined;
    const colon = line.indexOf(":");
    if (colon === -1 || /^\s/.test(line)) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (value === "") {
      data[key] = [];
      list = key;
    } else data[key] = scalarOf(value);
  }
  return { data, body: parts.slice(1).join("---").trim() };
};
