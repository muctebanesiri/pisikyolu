import { isCompactReply } from "./compact-reply.js";
import type { Heading, Link, Paragraph, PhrasingContent, Root, RootContent, Strong, Text } from "mdast";
import { toString as toStringUtil, visit } from "./tree";

const timestampRegex = /^\[(\d{1,2}:\d{2}(?::\d{2})?)\]/;
const maxConversationGapSeconds = 45;
const wrapClass = "message";
const textClass = "message-bubble";

function isTimestamp(node: Paragraph): boolean {
  if (node.children.length < 2) return false;
  const [first, second] = node.children;
  return (
    first.type === "text" &&
    second.type === "strong" &&
    timestampRegex.test((first as Text).value)
  );
}

function isSpeaker(node: Paragraph): boolean {
  return node.children.length > 0 && node.children[0].type === "strong";
}

function isHeading(node: RootContent): node is Heading {
  return node.type === 'heading';
}

function createText(value: string): Text {
  return { type: "text", value };
}

function plainQuotes(text: string): string {
  return text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
}

function isProvisionalSpeaker(speaker: string): boolean {
  return /^(?:unconfirmed\b|speaker\s+(?:\d+|unknown)\b)/i.test(speaker);
}

// A mini bubble is itself a playback link; never put another link/control inside it.
function hasInteractiveContent(node: PhrasingContent): boolean {
  if (['link', 'linkReference', 'image', 'imageReference'].includes(node.type)) return true;
  if (node.type === 'html' && !/^\s*(?:<span\s+id=["'][^"']+["']\s*>\s*(?:<\/span>)?|<\/span>)\s*$/u.test(node.value)) return true;
  return 'children' in node && node.children.some(hasInteractiveContent);
}

function messageIdMarkerCount(node: PhrasingContent): number {
  if (node.type === 'html') return (node.value.match(/\bdata-message-id\b/g) ?? []).length;
  return 'children' in node ? node.children.reduce((total, child) => total + messageIdMarkerCount(child), 0) : 0;
}

/** Preserve a reviewed same-second occurrence without changing its playback time. */
function extractMessageIdOverride(content: PhrasingContent[], seconds: number, timed: boolean) {
  const markers = content.map(messageIdMarkerCount);
  if (!markers.some(Boolean)) return { content, override: null };
  const index = markers.findIndex(Boolean);
  const leading = content.slice(0, index).every(node => node.type === 'text' && !node.value.trim());
  const node = content[index];
  let markup = node.type === 'html' ? node.value : '';
  let consumed = 1;
  if (!/<\/span>\s*$/.test(markup)) {
    while (content[index + consumed]?.type === 'text'
      && !(content[index + consumed] as Text).value.trim()) {
      markup += (content[index + consumed] as Text).value;
      consumed++;
    }
    const closing = content[index + consumed];
    if (closing?.type === 'html') {
      markup += closing.value;
      consumed++;
    }
  }
  const match = markup.match(/^<span\s+data-message-id=(["'])([^"'<>]+)\1\s*>\s*<\/span>$/);
  const identity = match?.[2].match(/^msg-(0|[1-9]\d*)-([1-9]\d*)$/);
  const occurrence = Number(identity?.[2]);
  if (markers.reduce((total, count) => total + count, 0) !== 1 || !leading || !timed
    || !identity || Number(identity[1]) !== seconds || !Number.isSafeInteger(occurrence) || occurrence < 2) {
    throw new Error('Invalid data-message-id: use a leading empty span with a same-timestamp occurrence ID (msg-<seconds>-<occurrence>, occurrence >= 2).');
  }
  return { content: [...content.slice(0, index), ...content.slice(index + consumed)], override: match![2] };
}

type Side = "sent" | "received" | "system";

interface Message {
  id: string;
  seconds: number;
  speaker: string;
  side: Side;
  timed: boolean;
  ack: boolean;
  nod: boolean;
  brief: boolean;
  prev: boolean;
  next: boolean;
  cont: boolean;
  inThread: boolean;
  content: PhrasingContent[];
}

function element(hName: string, hProperties: Record<string, unknown>, children: PhrasingContent[]): PhrasingContent {
  return { type: "span", data: { hName, hProperties }, children } as unknown as PhrasingContent;
}

function timeLink(seconds: number, children: PhrasingContent[]): Link {
  return {
    type: "link",
    url: `#t=${seconds}`,
    children: children as Link["children"],
  };
}

function run(message: Message): string | undefined {
  if (message.prev && message.next) return "mid";
  if (message.prev) return "end";
  if (message.next) return "start";
  if (message.cont && !message.inThread) return "cont";
}

function emit(node: Paragraph, message: Message) {
  const kind = message.nod ? "nod" : message.ack ? "ack" : message.brief ? "brief" : undefined;
  const label = (text: string) => element("b", {}, [createText(text)]);
  if (message.nod) {
    node.children = [timeLink(message.seconds, [label(`${message.speaker} · ${formatTimestamp(message.seconds)}`), ...message.content])];
  } else {
    const bubble = [...message.content];
    if (message.timed) bubble.push(timeLink(message.seconds, [createText(formatTimestamp(message.seconds))]));
    node.children = [
      ...(!message.ack && (message.prev || message.cont) ? [] : [label(message.speaker)]),
      element("span", { className: [textClass] }, bubble),
    ];
  }
  node.data = {
    hName: "p",
    hProperties: {
      id: message.id,
      className: [wrapClass],
      "data-side": message.side,
      ...(kind ? { "data-kind": kind } : {}),
      ...(run(message) ? { "data-run": run(message) } : {}),
    },
  };
}

function timeToSeconds(timestamp: string): number {
  const parts = timestamp.split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return parts[0] * 60 + parts[1];
}

function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = String(seconds % 60).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${remainder}`
    : `${minutes}:${remainder}`;
}

export function transcript(tree: Root, frontmatter: Record<string, unknown>, path = "transcript") {
    // Episode titles are the page's h1; transcript sections follow at h2.
    visit(tree, 'heading', (node) => {
      if (node.depth === 3 || node.depth === 4) node.depth = 2;
    });
    const shareExcerpt = frontmatter?.shareExcerpt;
    const speakerConfig: Record<string, string> = (frontmatter?.speakers as Record<string, string>) || {};
    const speakerOrder: string[] = [];
    const messageIdCountsBySecond = new Map<number, number>();
    const messages = new Map<RootContent, Message>();
    const replyTo = new Map<RootContent, string>();
    const threadOf = new Map<RootContent, string>();
    const usedMessageIds = new Set<string>();
    let speakerCount = 0;
    let lastSpeaker: string | null = null;
    let replyParent = "";
    let previousTime: number | null = null;
    let previousTimed = false;

    visit(tree, "paragraph", (node, index, parent) => {
      // Check if previous node was a heading
      const prevNode = index > 0 ? parent.children[index - 1] : null;
      if (prevNode && isHeading(prevNode)) {
        lastSpeaker = null;
        replyParent = "";
        previousTime = null;
      }

      let timestamp: string | null = null;
      let speaker: string | null = null;

      const hasExplicitTimestamp = isTimestamp(node);
      if (hasExplicitTimestamp) {
        const textValue = (node.children[0] as Text).value;
        const match = textValue.match(timestampRegex);
        if (match) {
          timestamp = match[1];
          speaker = toStringUtil(node.children[1] as Strong);
        }
      } else if (isSpeaker(node)) {
        timestamp = "00:00";
        speaker = toStringUtil(node.children[0] as Strong);
      } else {
        // Prose, quotations, lists, and other Markdown interrupt reply attachment.
        lastSpeaker = null;
        replyParent = "";
        previousTime = null;
        return;
      }

      if (!timestamp || !speaker) return;
      
      // use frontmatter config if present, else fallback to original logic
      let alignmentClass: Side;

      if (speaker.replace(/:$/, "") in speakerConfig) {
        const order = speakerConfig[speaker.replace(/:$/, "")];
        if (order === "left") {
          alignmentClass = "sent";
        } else if (order === "right") {
          alignmentClass = "received";
        } else {
          alignmentClass = "system";
        }
      } else {
        let speakerIndex = speakerOrder.indexOf(speaker);
        if (speakerIndex === -1) {
          speakerIndex = speakerCount++;
          speakerOrder.push(speaker);
        }
        alignmentClass = speakerIndex === 0 ? "sent" :
                         speakerIndex === 1 ? "received" : "system";
      }

      const originalContent = hasExplicitTimestamp
        ? node.children.slice(2)
        : node.children.slice(1);

      const seconds = timeToSeconds(timestamp);
      const { content, override } = extractMessageIdOverride(originalContent, seconds, hasExplicitTimestamp);
      const nextOccurrence = (messageIdCountsBySecond.get(seconds) ?? 0) + 1;
      messageIdCountsBySecond.set(seconds, nextOccurrence);
      const messageId = override ?? (nextOccurrence === 1
        ? `msg-${seconds}`
        : `msg-${seconds}-${nextOccurrence}`);
      if (usedMessageIds.has(messageId)) throw new Error(`Duplicate transcript message ID: ${messageId}`);
      usedMessageIds.add(messageId);
      if (typeof shareExcerpt === "string" && frontmatter) {
        const line = toStringUtil(content, { includeHtml: false });
        const start = plainQuotes(line).indexOf(plainQuotes(shareExcerpt));
        if (start >= 0) {
          if (frontmatter.sharePassage) throw new Error(`Ambiguous share excerpt in ${path}: ${shareExcerpt}`);
          frontmatter.sharePassage = {
            text: line.slice(start, start + shareExcerpt.length),
            speaker: speaker.replace(/:$/, ""), seconds: hasExplicitTimestamp ? seconds : null,
          };
        }
      }
      const previous = prevNode ? messages.get(prevNode as RootContent) : undefined;
      const adjacentMessage = Boolean(previous && previous.side !== 'system');
      const nearby = previousTime !== null && previousTimed === hasExplicitTimestamp
        && (!hasExplicitTimestamp || (seconds >= previousTime && seconds - previousTime <= maxConversationGapSeconds));
      
      // Look ahead for next speaker
      const nextNode = parent.children[index + 1] as RootContent;
      let nextSpeaker = null;
      let nextTimed = false;
      let nextSeconds = 0;
      if (nextNode) {
        if (isHeading(nextNode)) {
          nextSpeaker = null;
        } else if (nextNode.type === "paragraph" && isTimestamp(nextNode)) {
          nextSpeaker = toStringUtil(nextNode.children[1] as Strong);
          nextTimed = true;
          nextSeconds = timeToSeconds((nextNode.children[0] as Text).value.match(timestampRegex)![1]);
        } else if (nextNode.type === "paragraph" && isSpeaker(nextNode)) {
          nextSpeaker = toStringUtil(nextNode.children[0] as Strong);
        }
      }

      // Handle consecutive messages
      const canShareAttribution = alignmentClass !== 'system' && !isProvisionalSpeaker(speaker);
      const isNextConsecutive = canShareAttribution && speaker === nextSpeaker
        && hasExplicitTimestamp === nextTimed
        && (!hasExplicitTimestamp || (nextSeconds >= seconds && nextSeconds - seconds <= maxConversationGapSeconds));
      const isPrevConsecutive = canShareAttribution && adjacentMessage && nearby && speaker === lastSpeaker
        && !previous!.ack;

      const spokenText = content.map(part => toStringUtil(part)).join("").replace(/<[^>]*>/g, "").trim().replace(/^:\s*/, "");
      // Reviewed empty filler turns retain their original anchor and occurrence.
      // Keeping the source turn also keeps later same-second IDs stable.
      if (!spokenText) {
        node.children = content;
        node.data = { hName: 'span', hProperties: { id: messageId, className: ['transcript-anchor'] } };
        replyParent = "";
        previousTime = null;
        return;
      }
      const compactReply = Boolean(adjacentMessage && nearby && replyParent && lastSpeaker && lastSpeaker !== speaker
        && alignmentClass !== 'system' && !isProvisionalSpeaker(speaker) && !isProvisionalSpeaker(lastSpeaker)
        && !content.some(hasInteractiveContent) && isCompactReply(spokenText));
      const nod = compactReply && hasExplicitTimestamp;
      messages.set(node, {
        id: messageId, seconds, speaker: speaker.replace(/:$/, ""), side: alignmentClass, timed: hasExplicitTimestamp,
        ack: compactReply, nod,
        brief: spokenText.split(/\s+/).length <= 4 && alignmentClass !== 'system' && !isProvisionalSpeaker(speaker),
        prev: isPrevConsecutive, next: isNextConsecutive, cont: false, inThread: false,
        content: content as PhrasingContent[],
      });
      if (nod) replyTo.set(node, replyParent);

      lastSpeaker = speaker;
      previousTime = seconds;
      previousTimed = hasExplicitTimestamp;
      if (!compactReply) { replyParent = messageId; }
    });

    // Group only adjacent rendered turns. Markdown and canonical passage IDs stay flat.
    const grouped: RootContent[] = [];
    for (const node of tree.children) {
      const parentId = replyTo.get(node);
      const previous = grouped.at(-1);
      if (parentId && previous) {
        if (threadOf.get(previous) === parentId && previous.type === 'blockquote') {
          previous.children.push(node as Paragraph);
          continue;
        }
        const lead = messages.get(previous);
        if (lead?.id === parentId && previous.type === 'paragraph') {
          const thread: RootContent = {
            type: 'blockquote',
            data: { hName: 'div', hProperties: {
              className: ['message-thread', lead.side === 'received' ? 'thread-left' : 'thread-right'],
            } },
            children: [previous, node as Paragraph],
          };
          lead.inThread = true;
          threadOf.set(thread, parentId);
          grouped[grouped.length - 1] = thread;
          continue;
        }
      }
      grouped.push(node);
    }
    // A brief response does not restart the main speaker's visual run.
    // Structural boundaries and longer pauses restore the visible attribution.
    let previousLead: string | null = null;
    let previousEnd = 0;
    let previousEndTimed = false;
    for (const node of grouped) {
      const thread = threadOf.has(node) && node.type === 'blockquote';
      const lead = messages.get(thread ? node.children[0] : node);
      if (!lead || lead.nod || lead.side === 'system' || isProvisionalSpeaker(lead.speaker)) {
        previousLead = null;
        continue;
      }
      if (previousLead === lead.speaker && lead.timed === previousEndTimed
        && lead.seconds >= previousEnd && lead.seconds - previousEnd <= maxConversationGapSeconds) {
        lead.cont = true;
        if (thread && !lead.prev) node.data!.hProperties!['data-run'] = 'cont';
      }
      previousLead = lead.speaker;
      const tail = messages.get(thread ? node.children.at(-1)! : node) ?? lead;
      previousEnd = tail.seconds;
      previousEndTimed = tail.timed;
    }
    // Pair nearby responses on opposite sides without reordering their DOM/audio sequence.
    for (const group of grouped) {
      if (group.type !== 'blockquote' || !threadOf.has(group)) continue;
      const children = [group.children[0]];
      for (const reply of group.children.slice(1)) {
        const previous = children.at(-1);
        const previousReply = previous?.type === 'blockquote' ? messages.get(previous.children[0]) : undefined;
        const current = messages.get(reply)!;
        const left = current.side === 'received';
        const previousLeft = previousReply?.side === 'received';
        const gap = current.seconds - (previousReply?.seconds ?? NaN);
        if (previous?.type === 'blockquote' && previous.children.length === 1
          && left !== previousLeft && gap >= 0 && gap <= 8 && (previousLeft || gap === 0)) {
          previous.children.push(reply);
          (previous.data!.hProperties!.className as string[]).push('reply-row-pair');
        } else {
          children.push({ type: 'blockquote', data: { hName: 'div', hProperties: {
            className: ['reply-row'],
          } }, children: [reply] });
        }
      }
      group.children = children;
    }
    for (const [node, message] of messages) emit(node as Paragraph, message);
    tree.children = grouped;
    if (shareExcerpt && !frontmatter?.sharePassage) throw new Error(`Share excerpt missing from transcript in ${path}: ${shareExcerpt}`);
}
