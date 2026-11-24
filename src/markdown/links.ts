import type { Root } from "mdast";
import { toString, visit } from "./tree";

export interface ExtractedLink {
  text: string;
  url: string;
  quoteText?: string;
  blockquoteIndex: number;
}

export function extractLinks(tree: Root, frontmatter: Record<string, unknown>) {
  const extractedLinks: ExtractedLink[] = [];
  let refIndex = 0;

  // Older transcripts omitted the scheme on links to this site.
  visit(tree, "link", (node) => {
    if (/^hopeinsource\.com(?=[/?#]|$)/.test(node.url)) node.url = `https://${node.url}`;
  });

  visit(tree, "blockquote", (node) => {
    node.data ??= {};
    node.data.hProperties = { ...node.data.hProperties, id: `ref-${refIndex}`, className: ["reference-block"] };
    const quoteText = toString(node);
    visit(node, "link", (link) => {
      extractedLinks.push({ text: toString(link), url: link.url, quoteText, blockquoteIndex: refIndex });
    });
    refIndex++;
  });

  frontmatter.extractedLinks = extractedLinks;
}
