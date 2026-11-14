import type { MessageKey, Translate } from "#shared/i18n/index.ts";
import { columns, type Span, span, type View } from "#shared/render/index.ts";
import type { InitOutcome, InitStep } from "../init.action.ts";
import { TEST_PATH } from "../templates.ts";

const LABELS: Record<InitOutcome, { done: boolean; label: MessageKey; note?: MessageKey }> = {
  created: { done: true, label: "init.created" },
  overwritten: { done: true, label: "init.overwritten" },
  exists: { done: false, label: "init.skipped", note: "init.exists" },
  ignoreAdded: { done: true, label: "init.updated", note: "init.ignoreAdded" },
  ignorePresent: { done: false, label: "init.skipped", note: "init.ignorePresent" },
};

const row = (step: InitStep, t: Translate): Span[] => {
  const { done, label, note } = LABELS[step.outcome];
  return [
    done ? span("✓", "success") : span("·", "muted"),
    span(t(label), done ? "plain" : "muted"),
    span(step.path, "strong"),
    ...(note ? [span(t(note), "muted")] : []),
  ];
};

export const initView = (steps: readonly InitStep[], t: Translate): View => [
  [],
  ...columns(
    steps.map((step) => row(step, t)),
    { indent: 1 },
  ),
  [],
  [span(" "), span(t("init.next", { test: TEST_PATH, command: "ctxray test" }), "muted")],
];
