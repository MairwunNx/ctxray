// One answer of the upstream as the refusal check needs it: which turn it was for, its status, its body.
export type UpstreamAnswer = { position?: number | undefined; status: number; text: string };

const MESSAGE_LENGTH = 300;

// What the upstream said, in its own words: every provider puts them in `error.message`.
const messageOf = (text: string) => {
  try {
    const message = (JSON.parse(text) as { error?: { message?: unknown } }).error?.message;
    if (typeof message === "string" && message !== "") return message;
  } catch {}
  const flat = text.trim().replace(/\s+/g, " ");
  return flat.length > MESSAGE_LENGTH ? `${flat.slice(0, MESSAGE_LENGTH)}…` : flat || "—";
};

// The upstream refused the session when its last answer to a turn was an error: the model never spoke. A retry
// that went through clears the error before it. A session without turns goes by its last answer of any kind.
export const refusalOf = (answers: readonly UpstreamAnswer[]): { status: number; message: string } | undefined => {
  const last = answers.findLast((answer) => answer.position !== undefined) ?? answers.at(-1);
  if (!last || last.status < 400) return undefined;
  return { status: last.status, message: messageOf(last.text) };
};
