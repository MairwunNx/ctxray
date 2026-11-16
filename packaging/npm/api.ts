// What a runtime gets from `import … from "@mairwunnx/ctxray"` outside ctxray. The package gives the editor its
// types; the binary runs config and test files and serves them its own API (ADR 0001).
import { t } from "./translate.ts";

throw new Error(t("npm.outside"));
