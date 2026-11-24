import type { Nodes, Parents } from "mdast";

declare module "mdast" {
  interface Data {
    hName?: string;
    hProperties?: Record<string, unknown>;
  }
}

type NodeOf<T extends Nodes["type"]> = Extract<Nodes, { type: T }>;

/** Depth-first walk. A visitor may return the index to continue from in its parent, which also skips the node's children. */
export function visit<T extends Nodes["type"]>(
  tree: Parents,
  type: T,
  visitor: (node: NodeOf<T>, index: number, parent: Parents) => number | void,
) {
  const walk = (parent: Parents) => {
    for (let i = 0; i < parent.children.length; i++) {
      const node = parent.children[i] as Nodes;
      if (node.type === type) {
        const next = visitor(node as NodeOf<T>, i, parent);
        if (typeof next === "number") {
          i = next - 1;
          continue;
        }
      }
      if ("children" in node) walk(node);
    }
  };
  walk(tree);
}

export function toString(node: Nodes | Nodes[], { includeHtml = true } = {}): string {
  if (Array.isArray(node)) return node.map((child) => toString(child, { includeHtml })).join("");
  if (node.type === "html") return includeHtml ? node.value : "";
  if ("value" in node) return node.value;
  if ("alt" in node && node.alt) return node.alt;
  return "children" in node ? toString(node.children as Nodes[], { includeHtml }) : "";
}
