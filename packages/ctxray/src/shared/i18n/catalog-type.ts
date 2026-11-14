import type { CatalogShape } from "./catalog.ts";
import type { en } from "./locales/en/index.ts";

export type Catalog = CatalogShape<typeof en>;
export type MessageKey = keyof Catalog;
