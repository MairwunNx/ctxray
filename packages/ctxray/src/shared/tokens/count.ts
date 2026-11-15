import { countTokens as countO200k } from "gpt-tokenizer/encoding/o200k_base";
import { ANTHROPIC_CALIBRATION, calibratedCounter } from "./calibration/index.ts";
import { gemmaTokenizer } from "./gemma.ts";

// A local count is an approximation for every model (ADR 0012): it carries `exact: false` and renders with ≈.
export const LOCAL_METHOD = "local:o200k_base";
export const GEMMA_METHOD = "local:gemma4";

export const countTokens = (text: string): number => (text === "" ? 0 : countO200k(text));

export type TokenCounter = { method: string; count: (text: string) => number };

const O200K: TokenCounter = { method: LOCAL_METHOD, count: countTokens };

export type ModelFamily = "google" | "anthropic" | "other";

// Whether ctxray scales o200k to the family's own tokenizer by measured factors. Claude has none until someone
// runs `ctxray calibrate` with a key (ADR 0012).
export const isCalibrated = (family: ModelFamily) =>
  family !== "anthropic" || ANTHROPIC_CALIBRATION.status === "measured";

// Google's models count with the Gemma vocabulary, Claude with o200k scaled by the measured factors, every
// other one with plain o200k. Without the vocabulary or the factors, o200k.
export const counterFor = (family: ModelFamily): TokenCounter => {
  if (family === "anthropic") return calibratedCounter(O200K, ANTHROPIC_CALIBRATION) ?? O200K;
  if (family !== "google") return O200K;
  const gemma = gemmaTokenizer();
  if (!gemma) return O200K;
  return {
    method: GEMMA_METHOD,
    count: (text) => (text === "" ? 0 : gemma.encode(text, { add_special_tokens: false }).ids.length),
  };
};
