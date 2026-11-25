import { defineMdastPlugin } from "satteri";
import type { Root } from "mdast";

import { responsiveImages } from "./images";
import { extractLinks } from "./links";
import { marginNotes } from "./margin-notes";
import { transcript } from "./transcript";

export const transcriptMarkdown = defineMdastPlugin({
  name: "transcript",
  after(root, ctx) {
    const tree = structuredClone(root) as Root;
    const frontmatter = ctx.data.astro!.frontmatter;
    marginNotes(tree);
    extractLinks(tree, frontmatter);
    transcript(tree, frontmatter, ctx.fileURL?.pathname);
    responsiveImages(tree);
    ctx.replaceNode(root, tree);
  },
});
