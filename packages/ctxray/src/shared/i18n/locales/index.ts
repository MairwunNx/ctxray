import type { Catalog } from "../catalog-type.ts";
import { en } from "./en/index.ts";
import { ru } from "./ru/index.ts";

// A new language is a new folder next to these and one line here.
export const CATALOGS: Readonly<Record<string, Catalog>> = { en, ru };

export const DEFAULT_LANG = "en";
