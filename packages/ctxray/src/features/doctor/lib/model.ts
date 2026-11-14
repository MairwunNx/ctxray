import type { MessageKey, Params } from "#shared/i18n/index.ts";

// One line of `ctxray doctor`: an error fails the run, a warning only says what may go wrong.
export type Status = "ok" | "info" | "warning" | "error";
export type DoctorCheck = { status: Status; key: MessageKey; params?: Params };
export type DoctorSection = { title: MessageKey; checks: DoctorCheck[] };

export const check = (status: Status, key: MessageKey, params?: Params): DoctorCheck =>
  params === undefined ? { status, key } : { status, key, params };
