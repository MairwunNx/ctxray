// z for a two-sided 95 % interval.
const Z = 1.959_963_984_540_054;

export type Interval = { rate: number; low: number; high: number };

// The Wilson score interval of `successes` out of `samples`: unlike the plain ±z·σ, it stays inside [0, 1]
// and doesn't collapse to a point at 0/n or n/n, so 10 out of 10 still says “somewhere above 0.72”.
export const wilson = (successes: number, samples: number): Interval => {
  if (samples <= 0) return { rate: 0, low: 0, high: 1 };
  const rate = successes / samples;
  const z2 = Z * Z;
  const scale = 1 + z2 / samples;
  const center = (rate + z2 / (2 * samples)) / scale;
  const half = (Z / scale) * Math.sqrt((rate * (1 - rate)) / samples + z2 / (4 * samples * samples));
  return { rate, low: Math.max(0, center - half), high: Math.min(1, center + half) };
};

// `min` holds the lower bound to the threshold, `max` the upper one.
export type Threshold = { min: number } | { max: number };
export type Verdict = "passed" | "failed" | "inconclusive";

export type Judgement = Interval & {
  successes: number;
  samples: number;
  verdict: Verdict;
  // Inconclusive only: how many samples in all would settle it if the rate held, undefined when none would.
  needed?: number;
};

const holds = (interval: Interval, threshold: Threshold) =>
  "min" in threshold ? interval.low >= threshold.min : interval.high <= threshold.max;

const LIMIT = 100_000;

const neededFor = (rate: number, samples: number, threshold: Threshold) => {
  for (let total = samples + 1; total <= LIMIT; total = Math.max(total + 1, Math.ceil(total * 1.05))) {
    if (holds(wilson(rate * total, total), threshold)) {
      // Back off to the smallest count the bound passes at.
      let low = Math.max(samples + 1, Math.floor(total / 1.05));
      while (low < total && !holds(wilson(rate * low, low), threshold)) low++;
      return low;
    }
  }
  return undefined;
};

// A pass needs the whole interval on the right side of the threshold. When only the point estimate is there,
// the samples can't tell yet: inconclusive, with the sample count that would tell.
export const judge = (successes: number, samples: number, threshold: Threshold): Judgement => {
  const interval = wilson(successes, samples);
  const base = { ...interval, successes, samples };
  if (holds(interval, threshold)) return { ...base, verdict: "passed" };
  const pointHolds = "min" in threshold ? interval.rate >= threshold.min : interval.rate <= threshold.max;
  if (!pointHolds || samples === 0) return { ...base, verdict: samples === 0 ? "inconclusive" : "failed" };
  const needed = neededFor(interval.rate, samples, threshold);
  return { ...base, verdict: "inconclusive", ...(needed !== undefined && { needed }) };
};
