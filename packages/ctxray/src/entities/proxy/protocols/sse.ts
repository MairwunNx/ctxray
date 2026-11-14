// Server-sent events: `event:` lines where the protocol has them, `data:` lines always.
export type Event = { event?: string; data: unknown };

export const sseResponse = (events: readonly Event[], headers: Record<string, string> = {}): Response => {
  const text = events
    .map(({ event, data }) => `${event === undefined ? "" : `event: ${event}\n`}data: ${JSON.stringify(data)}\n\n`)
    .join("");
  return new Response(text, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache", ...headers },
  });
};

// Usage numbers in a mock reply are a rough chars/4 guess: no tokenizer stands behind them (ADR 0004).
export const roughTokens = (value: unknown): number => Math.ceil(JSON.stringify(value ?? "").length / 4);

export const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`;

export const chunks = (text: string, size: number): string[] =>
  text === ""
    ? [""]
    : Array.from({ length: Math.ceil(text.length / size) }, (_, i) => text.slice(i * size, (i + 1) * size));
