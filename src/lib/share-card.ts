import type { Episode } from "./episodes";
import { formatEpisodeDate } from "./dates";
import { formatMomentTime } from "./moments";

export const cardWidth = 1200;
export const cardHeight = 630;

export interface SharePassage {
  text: string;
  speaker: string;
  seconds: number | null;
}

export interface EpisodeCard {
  slug: string;
  title: string;
  guests: string[];
  number: number;
  date: string;
  passage?: SharePassage;
}

function speakerName(speaker: string, episode: Episode) {
  if (speaker === "Henry") return "Henry Zhu";
  if (speaker === "Nadia") return "Nadia Asparouhova";
  if (speaker === "Michael" && episode.data.guests.includes("L.M. Sacasas")) return "L.M. Sacasas";
  if (speaker === "Tara" && episode.slug === "online") return "Tara Isabella Burton";
  return episode.data.guests.find(guest => guest.split(" ")[0] === speaker) ?? speaker;
}

export function episodeCard(episode: Episode): EpisodeCard {
  const metadata = episode.rendered?.metadata?.frontmatter as { sharePassage?: SharePassage } | undefined;
  const passage = metadata?.sharePassage;
  if (episode.data.shareExcerpt && !passage) throw new Error(`Missing share passage for ${episode.slug}`);
  return {
    slug: episode.slug, title: episode.data.title, guests: episode.data.guests,
    number: episode.number, date: formatEpisodeDate(episode.data.date),
    passage: passage && { ...passage, speaker: speakerName(passage.speaker, episode) },
  };
}

export function passageCredit(passage: SharePassage): string {
  return passage.seconds === null ? passage.speaker : `${passage.speaker} · ${formatMomentTime(passage.seconds)}`;
}

export function shareImage(card?: EpisodeCard) {
  if (!card) return {
    path: "/share/show.png",
    alt: "Hope in Source. Off-the-cuff conversations between friends. A two-leaf seedling with pale roots grows from dark soil under green and gold northern lights.",
  };
  const line = card.passage ? ` “${card.passage.text}” — ${passageCredit(card.passage)}.` : "";
  return {
    path: `/share/episode/${card.slug}.png`,
    alt: `Hope in Source, episode ${card.number}. ${card.title}. ${card.date}.${line}`,
  };
}
