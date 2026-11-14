import type { CachedBuild } from "#entities/harness-cache/index.ts";
import type { Translate } from "#shared/i18n/index.ts";
import { columns, span, type View } from "#shared/render/index.ts";

const megabytes = (bytes: number, t: Translate) =>
  t("units.megabytes", { value: Math.max(1, Math.round(bytes / 1e6)).toString() });

const day = (date: Date) => date.toISOString().slice(0, 10);

export const listView = (dirs: readonly string[], builds: readonly CachedBuild[], t: Translate): View => {
  const total = builds.filter((build) => !build.shared).reduce((sum, build) => sum + build.size, 0);
  return [
    ...dirs.map((dir, index) => [span(` ${index === 0 ? dir : t("cache.layer", { dir })}`, "muted")]),
    [],
    ...(builds.length === 0
      ? [[span(` ${t("cache.empty")}`, "muted")]]
      : columns(
          builds.map((build) => [
            span(build.harness, "strong"),
            span(build.version),
            span(build.platform, "muted"),
            span(megabytes(build.size, t)),
            span(build.shared ? t("cache.shared") : t("cache.used", { date: day(build.lastUsed) }), "muted"),
          ]),
          { indent: 1 },
        )),
    [],
    [span(` ${t("cache.total", { size: megabytes(total, t), count: builds.length })}`, "muted")],
  ];
};

export const prunedView = (removed: readonly CachedBuild[], t: Translate): View => {
  if (removed.length === 0) return [[span(` ${t("cache.nothingToPrune")}`, "muted")]];
  const freed = removed.reduce((sum, build) => sum + build.size, 0);
  return [
    ...removed.map((build) => [span(" − ", "muted"), span(`${build.harness} ${build.version} ${build.platform}`)]),
    [],
    [span(` ${t("cache.pruned", { count: removed.length, size: megabytes(freed, t) })}`)],
  ];
};
