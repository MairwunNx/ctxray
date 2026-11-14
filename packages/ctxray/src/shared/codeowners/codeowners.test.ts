import { expect, test } from "bun:test";
import { parseCodeowners } from "./codeowners.ts";

const owners = parseCodeowners(`
# Everything else
*                            @acme/platform
/.claude/rules/payments.md   @Acme/Payments @alice
**/payments/                 @acme/payments   # nested folders too
docs/                        @acme/docs
/app/legacy/                 # no owners: nobody owns it
[Mobile][2] @acme/mobile
app/**/*.kt                  @acme/mobile
`);

test.each([
  ["README.md", ["@acme/platform"]],
  [".claude/rules/payments.md", ["@acme/payments", "@alice"]],
  ["app/src/main/kotlin/payments/AGENTS.md", ["@acme/payments"]],
  ["app/src/main/kotlin/payments/Charge.kt", ["@acme/mobile"]],
  ["docs/architecture.md", ["@acme/docs"]],
  ["app/legacy/Old.java", []],
])("%s belongs to %p", (path, expected) => {
  expect(owners.ownersOf(path)).toEqual(expected);
});

test("a file without lines owns nothing", () => {
  expect(parseCodeowners("").ownersOf("a.md")).toEqual([]);
});
