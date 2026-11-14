import type { HarnessId } from "#shared/contract/index.ts";
import type { Translate } from "#shared/i18n/index.ts";
import { span, type View } from "#shared/render/index.ts";
import type { Progress } from "./install.ts";

const megabytes = (bytes: number, t: Translate) =>
  t("units.megabytes", { value: Math.max(1, Math.round(bytes / 1e6)).toString() });

// The live line while ctxray installs a harness: `ctxray harness install`, or a run that finds one missing.
export const progressView = (harness: HarnessId, progress: Progress, t: Translate): View => {
  if (progress.phase === "waiting") return [[span(` ${t("harness.waiting", { harness })}`, "muted")]];
  if (progress.phase === "unpack") return [[span(` ${t("harness.unpacking", { harness })}`, "muted")]];
  const { done, total } = progress;
  const part =
    total === undefined
      ? megabytes(done, t)
      : `${Math.floor((done / total) * 100)}%  ${megabytes(done, t)} / ${megabytes(total, t)}`;
  return [[span(` ${t("harness.downloading", { harness })}  `), span(part, "muted")]];
};
