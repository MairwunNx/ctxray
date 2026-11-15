// `import css from "./x.css" with { type: "text" }`: Bun gives the file's text, embedded in a compiled binary.
declare module "*.css" {
  const text: string;
  export default text;
}
