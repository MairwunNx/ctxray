import { countTokens as countO200k } from "gpt-tokenizer/encoding/o200k_base";
import { gemmaTokenizer } from "./gemma.ts";

// A local count is an approximation for every model (ADR 0012): it carries `exact: false` and renders with ≈.
export const LOCAL_METHOD = "local:o200k_base";
export const GEMMA_METHOD = "local:gemma4";

export const countTokens = (text: string): number => (text === "" ? 0 : countO200k(text));

export type TokenCounter = { method: string; count: (text: string) => number };

const O200K: TokenCounter = { method: LOCAL_METHOD, count: countTokens };

// Google's models count with the Gemma vocabulary, every other one with o200k. Without the vocabulary, o200k.
export const counterFor = (family: "google" | "other"): TokenCounter => {
  if (family !== "google") return O200K;
  const gemma = gemmaTokenizer();
  if (!gemma) return O200K;
  return {
    method: GEMMA_METHOD,
    count: (text) => (text === "" ? 0 : gemma.encode(text, { add_special_tokens: false }).ids.length),
  };
};
