import type { Protocol } from "../model.ts";
import { anthropic } from "./anthropic.ts";
import { chat } from "./chat.ts";
import { gemini } from "./gemini.ts";
import type { Kit } from "./kit.ts";
import { responses } from "./responses.ts";

export const KITS: Record<Protocol, Kit> = { anthropic, responses, chat, gemini };
export type { Kit } from "./kit.ts";
export { roughTokens } from "./sse.ts";
