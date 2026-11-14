import { readFileSync } from "node:fs";
import { Tokenizer } from "@huggingface/tokenizers";
// Gemma 4's vocabulary, the closest public one to Gemini's (ADR 0012): `tokenizer.json` of google/gemma-4-E2B-it
// at revision 4adf157, Apache-2.0, gzipped. Bun embeds the file in the compiled binary.
import vocabulary from "./gemma/tokenizer.json.gz" with { type: "file" };
import config from "./gemma/tokenizer_config.json" with { type: "json" };

let tokenizer: Tokenizer | null | undefined;

// Loaded on the first Gemini count only: it takes about 200 ms and 400 MB while it parses. Undefined when the
// vocabulary can't load, and the caller falls back to o200k.
export const gemmaTokenizer = (): Tokenizer | undefined => {
  if (tokenizer === undefined) {
    try {
      const json = JSON.parse(new TextDecoder().decode(Bun.gunzipSync(readFileSync(vocabulary))));
      tokenizer = new Tokenizer(json, config);
    } catch {
      tokenizer = null;
    }
  }
  return tokenizer ?? undefined;
};
