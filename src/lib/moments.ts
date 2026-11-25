import type { CollectionEntry } from "astro:content";

export interface MomentLine {
  id: string;
  seconds: number;
  speaker: string;
  side: "sent" | "received";
  text: string;
}

export interface Moment extends MomentLine {
  preview?: string;
  before: MomentLine;
  after?: MomentLine;
}

export function episodeMoments(episode: CollectionEntry<"podcast">): Moment[] {
  const declared = episode.data.moments ?? [];
  const resolved = (episode.rendered?.metadata?.frontmatter as { momentPassages?: Moment[] } | undefined)?.momentPassages ?? [];
  if (resolved.length !== declared.length) throw new Error(`Unresolved moments in ${episode.id}`);
  return resolved;
}

export function formatMomentTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = String(seconds % 60).padStart(2, "0");
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${remainder}`
    : `${minutes}:${remainder}`;
}
