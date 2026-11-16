// Cuts payload text into sections at marker lines. A harness wraps each piece of context in fixed phrases
// (ADR 0005, 0006), so a marker names the piece and its text runs to the next marker.
export type Marker<K extends string> = { kind: K; pattern: RegExp };
export type Section<K extends string> = { kind: K | undefined; match: RegExpExecArray | undefined; text: string };

export const splitSections = <K extends string>(text: string, markers: readonly Marker<K>[]): Section<K>[] => {
  const sections: Section<K>[] = [];
  let current: Section<K> = { kind: undefined, match: undefined, text: "" };
  for (const line of text.split("\n")) {
    const hit = markers.flatMap(({ kind, pattern }) => {
      const match = pattern.exec(line);
      return match ? [{ kind, match }] : [];
    })[0];
    if (hit) {
      if (current.text.trim() !== "" || current.kind !== undefined) sections.push(current);
      current = { kind: hit.kind, match: hit.match, text: line };
    } else {
      current.text = current.text === "" && current.kind === undefined ? line : `${current.text}\n${line}`;
    }
  }
  if (current.text.trim() !== "" || current.kind !== undefined) sections.push(current);
  return sections;
};

// `<system-reminder>` blocks one by one, then whatever text stood outside them.
export const reminders = (text: string): { inside: string[]; outside: string } => {
  const inside: string[] = [];
  const outside = text.replace(/<system-reminder>\n?([\s\S]*?)\n?<\/system-reminder>/g, (_, body: string) => {
    inside.push(body);
    return "";
  });
  return { inside, outside: outside.trim() };
};

// A path in the payload, relative to the project copy when it lies inside it.
export const projectPath = (work: string, path: string) =>
  path.startsWith(`${work}/`) ? path.slice(work.length + 1) : path;

export const slug = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

// `- name: description` lines of a listing.
export const listing = (text: string) =>
  text.split("\n").flatMap((line) => {
    const match = /^- ([^:\s].*?): /.exec(line);
    // Claude Code adds a skill's own `name` in brackets when it differs from the folder: `- folder (name):`.
    // A plugin's skill keeps the plugin in its name: `- plugin:skill:`.
    return match ? [{ name: (match[1] as string).replace(/ \([^)]*\)$/, ""), line }] : [];
  });
