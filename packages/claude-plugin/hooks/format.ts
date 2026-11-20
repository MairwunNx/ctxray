// Small pure helpers the band and the pane share.

// 980, 1.2k, 48k, 1.2M: a number short enough for a narrow column.
export const tokens = (n: number): string => {
  if (n < 1000) return `${n}`;
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
};

export const percent = (part: number, whole: number): string => {
  if (whole <= 0 || part <= 0) return "0%";
  const share = (part / whole) * 100;
  return share < 1 ? "<1%" : `${Math.round(share)}%`;
};

// A path as the person knows it: inside the project from its root, under the home folder with ~.
// macOS spells the temp folder both /var and /private/var, so both sides drop /private first.
const plain = (path: string) => (path.startsWith("/private/") ? path.slice("/private".length) : path);

export const shortPath = (path: string, cwd: string, home: string): string => {
  const file = plain(path);
  const root = plain(cwd.endsWith("/") ? cwd : `${cwd}/`);
  if (cwd !== "" && file.startsWith(root)) return file.slice(root.length);
  if (home !== "" && file.startsWith(`${plain(home)}/`)) return `~/${file.slice(plain(home).length + 1)}`;
  return path;
};

// A bar of `width` cells split between the shares, each at least one cell when it has tokens.
export const cells = (values: readonly number[], width: number): number[] => {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0 || width <= 0) return values.map(() => 0);
  const raw = values.map((value) => (value / total) * width);
  const out = raw.map((value, i) => ((values[i] ?? 0) > 0 ? Math.max(1, Math.floor(value)) : 0));
  let left = width - out.reduce((sum, value) => sum + value, 0);
  const order = raw.map((value, i) => ({ i, rest: value - Math.floor(value) })).sort((a, b) => b.rest - a.rest);
  for (const { i } of order) {
    if (left <= 0) break;
    if ((values[i] ?? 0) > 0) {
      out[i] = (out[i] ?? 0) + 1;
      left -= 1;
    }
  }
  while (left < 0) {
    const widest = out.indexOf(Math.max(...out));
    out[widest] = (out[widest] ?? 0) - 1;
    left += 1;
  }
  return out;
};

// `ru_RU.UTF-8` and `ru-RU` mean ru, `C` and `POSIX` mean nothing, as in the ctxray CLI.
export const languageOf = (value: string | undefined): string | undefined => {
  const base = value
    ?.trim()
    .split(/[_.@-]/)[0]
    ?.toLowerCase();
  if (!base || base === "c" || base === "posix" || base === "auto") return undefined;
  return /^[a-z]{2,3}$/.test(base) ? base : undefined;
};
