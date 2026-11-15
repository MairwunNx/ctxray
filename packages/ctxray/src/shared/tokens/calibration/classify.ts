// The content classes a calibration measures apart: tokenizers disagree most between them (ADR 0012).
export const CONTENT_CLASSES = ["prose", "nonLatin", "code", "json", "metadata"] as const;
export type ContentClass = (typeof CONTENT_CLASSES)[number];

const isJson = (text: string) => {
  const trimmed = text.trim();
  if (!/^[[{]/.test(trimmed)) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
};

const CODE_LINE = /[;{}]\s*$|^\s*(?:import|export|def|fun|class|const|let|val|return|if|for)\b|=>|\)\s*:\s*$/;

// Which class a text belongs to: JSON parses, letters outside Latin dominate, most lines look like code,
// or a few list lines. The rest is prose.
export const classify = (text: string): ContentClass => {
  if (isJson(text)) return "json";
  const letters = text.match(/\p{L}/gu) ?? [];
  const latin = letters.filter((letter) => /\p{Script=Latin}/u.test(letter)).length;
  if (letters.length > 0 && latin / letters.length < 0.5) return "nonLatin";
  const lines = text.split("\n").filter((line) => line.trim() !== "");
  if (lines.length > 0 && lines.filter((line) => CODE_LINE.test(line)).length / lines.length >= 0.4) return "code";
  if (lines.length <= 6 && lines.every((line) => /^\s*[-*]\s/.test(line))) return "metadata";
  return "prose";
};
