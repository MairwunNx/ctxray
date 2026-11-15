import type { Usage } from "./usage.ts";

// US dollars per million tokens.
export type Price = { input: number; output: number; cacheRead?: number | undefined; cacheWrite?: number | undefined };

// List prices of the models ctxray's adapters run by default, as the providers published them on 2026-11-15.
// The config's `prices` adds models and overrides these. Anthropic charges 1.25 times the input for a cache write.
export const PRICES: Readonly<Record<string, Price>> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  "gpt-5.5": { input: 5, output: 30, cacheRead: 0.5 },
  "gemini-2.5-flash": { input: 0.3, output: 2.5, cacheRead: 0.03 },
};

// A model the harness names with a provider or a date, like `anthropic/claude-sonnet-5-5`, costs what its
// base name costs.
export const priceOf = (model: string, own: Readonly<Record<string, Price>> = {}): Price | undefined => {
  const prices = { ...PRICES, ...own };
  const name = model.split("/").at(-1) ?? model;
  return prices[model] ?? prices[name] ?? prices[name.replace(/-\d{8}$/, "")];
};

// Undefined when nobody knows the model's price: ctxray shows the tokens and leaves the cost out.
export const costOf = (usage: Usage, price: Price | undefined): number | undefined => {
  if (!price) return undefined;
  const cents =
    usage.input * price.input +
    usage.output * price.output +
    usage.cacheRead * (price.cacheRead ?? price.input) +
    usage.cacheWrite * (price.cacheWrite ?? price.input);
  return cents / 1_000_000;
};
