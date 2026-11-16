// Compiles the ctxray binary for this machine into dist/ctxray. scripts/release.ts builds every platform.
import { compile, reportClient } from "./lib/compile.ts";

await compile("dist/ctxray", await reportClient());
console.log("dist/ctxray");
