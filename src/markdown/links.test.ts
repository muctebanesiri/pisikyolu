import { expect, test } from "bun:test";

import { render } from "./test-render";

const processMarkdown = async (markdown: string) => render(markdown);

test("scheme-less site links render correctly and reference extraction uses the normalized URL", async () => {
  const result = await processMarkdown("[Hope In Source: Emotional Programming](hopeinsource.com/emotional)\n\n> [A reference](hopeinsource.com/emotional#msg-20)");
  expect(result.html).toContain('<a href="https://hopeinsource.com/emotional">Hope In Source: Emotional Programming</a>');
  expect(result.html).toContain('<a href="https://hopeinsource.com/emotional#msg-20">A reference</a>');
  expect(result.frontmatter.extractedLinks).toEqual([{
    text: "A reference", url: "https://hopeinsource.com/emotional#msg-20",
    quoteText: "A reference", blockquoteIndex: 0,
  }]);
});

test("only the exact scheme-less site host is normalized", async () => {
  const unchanged = [
    "hopeinsource.com.evil/emotional", "hopeinsource.com-other/emotional",
    "/emotional", "#msg-20", "https://hopeinsource.com/emotional", "https://example.com",
  ];
  const result = await processMarkdown(unchanged.map((url, i) => `[Link ${i}](${url})`).join("\n\n"));
  for (const [i, url] of unchanged.entries()) {
    expect(result.html).toContain(`<a href="${url}">Link ${i}</a>`);
  }
});
