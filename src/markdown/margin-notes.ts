import type { Blockquote, FootnoteDefinition, Link, PhrasingContent, Root, RootContent, Text } from "mdast";
import { visit } from "./tree";

type Note = { id: string; definition: FootnoteDefinition };

function takePhrase(siblings: PhrasingContent[], refIndex: number): { start: number; nodes: PhrasingContent[] } | null {
  const last = siblings[refIndex - 1];
  if (last?.type !== "text" || !last.value.endsWith("]")) return null;
  let depth = 0;
  for (let i = refIndex - 1; i >= 0; i--) {
    const node = siblings[i];
    if (node.type !== "text") continue;
    const value = i === refIndex - 1 ? node.value.slice(0, -1) : node.value;
    for (let c = value.length - 1; c >= 0; c--) {
      if (value[c] === "]") depth++;
      else if (value[c] === "[" && depth-- === 0) {
        const head = node.value.slice(0, c);
        const tail = node.value.slice(c + 1, i === refIndex - 1 ? -1 : undefined);
        const inner = siblings.slice(i + 1, refIndex - 1);
        const nodes: PhrasingContent[] = i === refIndex - 1
          ? [{ type: "text", value: tail }]
          : [{ type: "text", value: tail }, ...inner, { type: "text", value: last.value.slice(0, -1) }];
        const before: PhrasingContent[] = head ? [{ type: "text", value: head }] : [];
        siblings.splice(i, refIndex - i + 1, ...before);
        return { start: i + before.length, nodes: nodes.filter((n) => n.type !== "text" || n.value) };
      }
    }
  }
  return null;
}

function splitSource(note: Blockquote) {
  const paragraph = note.children.at(-1);
  if (paragraph?.type !== "paragraph") return;
  const link = paragraph.children.at(-1);
  const before = paragraph.children.at(-2);
  if (link?.type !== "link" || before?.type !== "text") return;
  const dash = before.value.match(/\s+[-–—]\s*$/);
  if (!dash) return;
  before.value = before.value.slice(0, dash.index);
  paragraph.children.pop();
  let host = "";
  try { host = new URL((link as Link).url).hostname.replace(/^www\./, ""); } catch {}
  note.children.push({
    type: "paragraph",
    data: { hProperties: { className: ["note-source"] } },
    children: [link, ...(host ? [{ type: "emphasis", data: { hName: "span", hProperties: { className: ["note-host"] } }, children: [{ type: "text", value: host } as Text] } as PhrasingContent] : [])],
  });
}

/**
 * Footnotes become margin notes: `[phrase][^id]` marks the phrase, and
 * `[^id]: …` becomes a note block after the message that holds it.
 */
export function marginNotes(tree: Root) {
  const definitions = new Map<string, FootnoteDefinition>();
  tree.children = tree.children.filter((node) => {
    if (node.type !== "footnoteDefinition") return true;
    definitions.set(node.identifier, node);
    return false;
  });

  const out: RootContent[] = [];
  for (const block of tree.children) {
    out.push(block);
    if (block.type !== "paragraph" && block.type !== "heading") continue;
    const notes: Note[] = [];
    visit(block, "footnoteReference", (ref, index, parent) => {
      const definition = definitions.get(ref.identifier);
      if (!definition) return;
      const id = ref.identifier.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
      const siblings = parent.children as PhrasingContent[];
      const phrase = takePhrase(siblings, index);
      if (phrase) {
        siblings.splice(phrase.start, 0, {
          type: "emphasis",
          data: { hName: "span", hProperties: { id: `note-${id}`, className: ["note-anchor"], dataNote: id } },
          children: phrase.nodes,
        });
      } else {
        siblings.splice(index, 1);
      }
      notes.push({ id, definition });
      return phrase ? phrase.start + 1 : index;
    });
    for (const { id, definition } of notes) {
      out.push({
        type: "blockquote",
        data: { hProperties: { dataNote: id } },
        children: definition.children as Blockquote["children"],
      });
    }
  }
  tree.children = out;

  for (const node of tree.children) {
    if (node.type === "blockquote") splitSource(node);
  }
}
