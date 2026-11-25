import { expect, test } from "bun:test";

import { render as renderMarkdown } from "./test-render";

const render = async (markdown: string) => (await renderMarkdown(markdown)).html;

test("a footnoted phrase is marked and its note follows the message", async () => {
  const html = await render(`Henry: when you wrote [Fortnite and *the* Good Life][^fortnite], right.

Next message.

[^fortnite]: "Naturally, then…" - [Michael](https://www.tinyletter.com/x)`);
  expect(html).toContain('when you wrote <span id="note-fortnite" class="note-anchor" data-note="fortnite">Fortnite and <em>the</em> Good Life</span>, right.');
  expect(html).toMatch(/right\.<\/p>\n<blockquote data-note="fortnite" id="ref-0" class="reference-block">\n<p>"Naturally, then…"<\/p>\n<p class="note-source"><a href="https:\/\/www.tinyletter.com\/x">Michael<\/a><span class="note-host">tinyletter.com<\/span><\/p>\n<\/blockquote>\n<p>Next message.<\/p>/);
  expect(html).not.toContain("footnote");
});

test("a footnote without a phrase still becomes a note after its message", async () => {
  const html = await render(`Plain point.[^a] And [brackets] stay.

[^a]: A note.`);
  expect(html).toContain("<p>Plain point. And [brackets] stay.</p>\n<blockquote data-note=\"a\" id=\"ref-0\" class=\"reference-block\">\n<p>A note.</p>\n</blockquote>");
});
