// The content both renderers draw: lines of spans, each with a tone. Ink turns tones into colours,
// the plain renderer drops them, so a CI log and a terminal show the same words.
export type Tone = "plain" | "strong" | "accent" | "success" | "failure" | "warning" | "muted";
export type Span = { readonly text: string; readonly tone: Tone };
export type Line = readonly Span[];
export type View = readonly Line[];

export const span = (text: string, tone: Tone = "plain"): Span => ({ text, tone });
