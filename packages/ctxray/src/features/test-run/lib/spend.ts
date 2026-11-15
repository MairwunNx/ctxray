import {
  type Answer,
  addUsage,
  costOf,
  type Exchange,
  NO_USAGE,
  type Price,
  priceOf,
  type Usage,
  usageOf,
} from "#entities/proxy/index.ts";
import type { Budget } from "#shared/contract/index.ts";

// What the real model cost this run so far. `cost` leaves out the models nobody priced: `unpriced` names them.
export type SpendTotal = { usage: Usage; cost: number; unpriced: readonly string[]; answers: number };

const tokensOf = (usage: Usage) => usage.input + usage.cacheRead + usage.cacheWrite + usage.output;

// Gemini names the model in the path, the rest in the body.
const modelOf = (exchange: Exchange) => {
  const named = exchange.body["model"];
  if (typeof named === "string") return named;
  return /\/models\/([^/:]+)/.exec(exchange.path)?.[1] ?? "unknown";
};

export const createSpend = (budget: Budget, prices: Readonly<Record<string, Price>>) => {
  let usage = NO_USAGE;
  let cost = 0;
  let answers = 0;
  const unpriced = new Set<string>();
  return {
    add: (exchange: Exchange, answer: Answer) => {
      const used = usageOf(exchange.protocol, answer.text);
      const model = modelOf(exchange);
      const priced = costOf(used, priceOf(model, prices));
      if (priced === undefined) unpriced.add(model);
      usage = addUsage(usage, used);
      cost += priced ?? 0;
      answers++;
    },
    // Why the next request must not go out, in English: the harness shows it, not the user.
    refuse: (): string | undefined => {
      if (budget.usd !== undefined && cost >= budget.usd) return `the run's budget of $${budget.usd} is spent`;
      if (budget.tokens !== undefined && tokensOf(usage) >= budget.tokens) {
        return `the run's budget of ${budget.tokens} tokens is spent`;
      }
      return undefined;
    },
    total: (): SpendTotal => ({ usage, cost, unpriced: [...unpriced].sort(), answers }),
  };
};
export type Spend = ReturnType<typeof createSpend>;
