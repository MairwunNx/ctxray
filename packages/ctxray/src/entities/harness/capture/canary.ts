// A canary marker proves a file reached the model: ctxray appends `⟦ctx:<path>⟧` to each instruction, skill,
// and command in the isolated copy, then finds the markers in the payload. Never in the user's own tree.
const CANARY = /⟦ctx:([^⟧\n]+)⟧/g;

export const canaryOf = (path: string) => `⟦ctx:${path}⟧`;

export const withCanary = (text: string, path: string) => `${text.replace(/\n*$/, "")}\n\n${canaryOf(path)}\n`;

export const canariesIn = (text: string): string[] => [...text.matchAll(CANARY)].map((match) => match[1] as string);

// The text as the user wrote it: tokens and snapshots never count the markers.
export const withoutCanaries = (text: string) => text.replace(/\n*⟦ctx:[^⟧\n]+⟧\n?/g, "");

// The same text with runs of whitespace collapsed, so a chunk matches its file whatever the harness did to
// the line breaks. A fingerprint is a file's normalised text: found in the payload, it ties the chunk to it.
export const normalise = (text: string) => withoutCanaries(text).replace(/\s+/g, " ").trim();
