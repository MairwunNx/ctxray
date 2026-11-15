import type { TokenCounter } from "../count.ts";
import { CONTENT_CLASSES, type ContentClass, classify } from "./classify.ts";

// A content class's factor from o200k to the provider's own count, and the spread around it: the 5th and
// 95th percentile of the per-piece ratio over the median, minus one.
export type ClassFactor = { factor: number; low: number; high: number; pieces: number };

export type Calibration =
  | { status: "unmeasured" }
  | {
      status: "measured";
      provider: string;
      model: string;
      date: string; // YYYY-MM-DD
      ctxray: string;
      classes: Record<ContentClass, ClassFactor>;
    };

export type Measured = { class: ContentClass; local: number; exact: number };

const quantile = (sorted: readonly number[], q: number) => {
  const at = (sorted.length - 1) * q;
  const below = sorted[Math.floor(at)] ?? 0;
  const above = sorted[Math.ceil(at)] ?? below;
  return below + (above - below) * (at - Math.floor(at));
};

const round = (value: number) => Math.round(value * 1000) / 1000;

// Factors per class from pieces counted both ways (ADR 0012, step 7).
export const factorsOf = (measured: readonly Measured[]): Record<ContentClass, ClassFactor> => {
  const classes = {} as Record<ContentClass, ClassFactor>;
  for (const name of CONTENT_CLASSES) {
    const ratios = measured
      .filter((piece) => piece.class === name && piece.local > 0)
      .map((piece) => piece.exact / piece.local)
      .sort((a, b) => a - b);
    const median = ratios.length > 0 ? quantile(ratios, 0.5) : 1;
    if (ratios.length === 0) {
      classes[name] = { factor: 1, low: 0, high: 0, pieces: 0 };
      continue;
    }
    classes[name] = {
      factor: round(median),
      low: round(quantile(ratios, 0.05) / median - 1),
      high: round(quantile(ratios, 0.95) / median - 1),
      pieces: ratios.length,
    };
  }
  return classes;
};

// A local counter scaled to the provider by the class of each text. Still an estimate: `exact` stays false.
export const calibratedCounter = (base: TokenCounter, calibration: Calibration): TokenCounter | undefined => {
  if (calibration.status !== "measured") return undefined;
  return {
    method: `${base.method}+calibrated:${calibration.model}`,
    count: (text) => Math.round(base.count(text) * calibration.classes[classify(text)].factor),
  };
};
