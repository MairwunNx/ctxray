import type { Json, Step } from "../model.ts";

// What the proxy needs from one wire protocol: where a request sits in the conversation, and how to answer.
export type Kit = {
  position: (body: Json) => number; // model turns before this request
  hasTools: (body: Json) => boolean; // false for side calls, like session titles
  reply: (step: Step, body: Json, stream: boolean) => Response;
  error: (status: number, message: string) => Response;
};
