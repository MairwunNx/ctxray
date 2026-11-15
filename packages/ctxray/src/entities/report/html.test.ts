import { expect, test } from "bun:test";
import { toHtml } from "./html.ts";
import { REPORT } from "./report.fixture.ts";

test("one file: the report and the catalogs of its languages inline, nothing that ends a script early", async () => {
  const hostile = { ...REPORT, project: { name: "pay</script><b>ments", root: "." } };
  const html = await toHtml(hostile);
  const data = /<script id="ctxray-report" type="application\/json">(.*?)<\/script>/s.exec(html)?.[1] ?? "";
  expect(JSON.parse(data).project.name).toBe("pay</script><b>ments");
  expect(data).not.toContain("</script");
  const messages = /<script id="ctxray-messages" type="application\/json">(.*?)<\/script>/s.exec(html)?.[1] ?? "{}";
  expect(Object.keys(JSON.parse(messages))).toEqual(["en", "ru"]);
  expect(html).toContain("<title>ctxray · pay&lt;/script&gt;&lt;b&gt;ments</title>");
  expect(html).not.toMatch(/<script src=|<link /);
});
