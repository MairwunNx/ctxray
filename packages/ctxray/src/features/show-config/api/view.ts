import type { Translate } from "../../../shared/i18n/index.ts";
import { span, type View } from "../../../shared/render/index.ts";
import type { ShownConfig } from "../show-config.action.ts";

export const showConfigView = ({ files, json }: ShownConfig, t: Translate): View => [
  [span(files.length > 0 ? t("config.files", { files: files.join(" ← ") }) : t("config.none"), "muted")],
  [],
  ...json.split("\n").map((line) => [span(line)]),
];
