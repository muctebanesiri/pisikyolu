import { markdownToHtml } from "satteri";
import { transcriptMarkdown } from ".";

export async function render(markdown: string, frontmatter: Record<string, unknown> = {}) {
  const result = await markdownToHtml(markdown, {
    mdastPlugins: [transcriptMarkdown],
    features: { gfm: true, smartPunctuation: false },
    data: { astro: { frontmatter, headings: [], localImagePaths: new Set<string>(), remoteImagePaths: new Set<string>() } },
  });
  return { html: result.html, frontmatter };
}
