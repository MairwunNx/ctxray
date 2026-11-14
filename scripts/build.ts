// Compiles the ctxray binary for this machine into dist/ctxray. `bun build --compile` alone can't do it:
// Ink imports react-devtools-core, which has to become a stub (ADR 0002 has the details).
import type { BunPlugin } from "bun";

const stubDevtools: BunPlugin = {
  name: "stub-react-devtools-core",
  setup(build) {
    build.onResolve({ filter: /^react-devtools-core$/ }, () => ({ path: "react-devtools-core", namespace: "stub" }));
    build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
      contents: "export default { initialize() {}, connectToDevTools() {} };",
      loader: "js",
    }));
  },
};

const result = await Bun.build({
  entrypoints: ["packages/ctxray/src/app/main.ts"],
  // A user's .env or bunfig.toml must not change how ctxray itself runs.
  compile: { outfile: "dist/ctxray", autoloadDotenv: false, autoloadBunfig: false },
  // Without it the binary carries React's development build and its warnings.
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  plugins: [stubDevtools],
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
console.log("dist/ctxray");
