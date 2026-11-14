// `import path from "./x.json.gz" with { type: "file" }`: Bun gives the file's path, embedded in a compiled binary.
declare module "*.json.gz" {
  const path: string;
  export default path;
}
