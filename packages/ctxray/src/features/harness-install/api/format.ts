import type { LockedHarness } from "#shared/contract/index.ts";
import type { Translate } from "#shared/i18n/index.ts";

// 376 MB, 1.2 GB: harness builds run to hundreds of megabytes, so whole megabytes read best.
export const bytes = (count: number, t: Translate) =>
  count >= 1e9
    ? t("units.gigabytes", { value: (Math.round(count / 1e8) / 10).toString() })
    : t("units.megabytes", { value: Math.max(1, Math.round(count / 1e6)).toString() });

export const seconds = (ms: number, t: Translate) => t("test.seconds", { seconds: Math.round(ms / 100) / 10 });

// `0.169.0 (0.169.x)` for a registry build, `2.1.311 (PATH)` for one from PATH.
export const lockedText = (locked: LockedHarness, t: Translate) =>
  locked.source === "system"
    ? `${locked.version} (${t("harness.fromPath")})`
    : locked.range === locked.version
      ? locked.version
      : `${locked.version} (${locked.range})`;
