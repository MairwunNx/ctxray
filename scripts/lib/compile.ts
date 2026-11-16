// Compiles the ctxray binary. `bun build --compile` alone can't do it: Ink imports react-devtools-core, which has
// to become a stub (ADR 0002 has the details).
import type { BunPlugin, CompileBuildOptions } from "bun";

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

const fail = (logs: readonly unknown[]): never => {
  for (const log of logs) console.error(log);
  process.exit(1);
};

// The HTML report's page script, bundled once and handed to the binary as a constant (entities/report/html.ts).
export const reportClient = async () => {
  const client = await Bun.build({
    entrypoints: ["packages/ctxray/src/entities/report/client/main.ts"],
    target: "browser",
    format: "iife",
    minify: true,
  });
  const [page] = client.outputs;
  return client.success && page ? page.text() : fail(client.logs);
};

// `target` is one of Bun's (`bun-linux-x64-musl`), the machine's own when left out.
export const compile = async (outfile: string, client: string, target?: CompileBuildOptions["target"]) => {
  const result = await Bun.build({
    entrypoints: ["packages/ctxray/src/app/main.ts"],
    // A user's .env or bunfig.toml must not change how ctxray itself runs.
    compile: { outfile, autoloadDotenv: false, autoloadBunfig: false, ...(target ? { target } : {}) },
    // Bytecode starts the binary faster and needs ESM, the CLI has top-level await (ADR 0001).
    bytecode: true,
    format: "esm",
    minify: true,
    sourcemap: "linked",
    // Without it the binary carries React's development build and its warnings.
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
      CTXRAY_REPORT_CLIENT: JSON.stringify(client),
    },
    plugins: [stubDevtools],
  });
  if (!result.success) fail(result.logs);
};
