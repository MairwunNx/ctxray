import { countTokens as countO200k } from "gpt-tokenizer/encoding/o200k_base";

// A local count is an approximation for every model (ADR 0012): it carries `exact: false` and renders with ≈.
export const LOCAL_METHOD = "local:o200k_base";

export const countTokens = (text: string): number => (text === "" ? 0 : countO200k(text));
