import anthropicFile from "./anthropic.json" with { type: "json" };
import type { Calibration } from "./calibration.ts";
import type { ContentClass } from "./classify.ts";
import corpusFile from "./corpus.json" with { type: "json" };

export { type Calibration, type ClassFactor, calibratedCounter, factorsOf, type Measured } from "./calibration.ts";
export { CONTENT_CLASSES, type ContentClass, classify } from "./classify.ts";

// The pieces `ctxray calibrate` counts both ways: Markdown, other scripts, code, tool schemas, list lines.
export const CORPUS = corpusFile.pieces as { class: ContentClass; text: string }[];

// Measured by `ctxray calibrate --provider anthropic` with a key, committed for everyone offline. Until then,
// Claude counts say `calibration: "none"`.
export const ANTHROPIC_CALIBRATION = anthropicFile as Calibration;
