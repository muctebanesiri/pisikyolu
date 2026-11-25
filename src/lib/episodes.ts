import { getCollection, type CollectionEntry } from "astro:content";
import { toPersianDigits } from "@/lib/localization";  // ✅ added

export interface GuestDisplay {
  name: string;
  count: number;
}

export interface RelatedByGuest {
  guest: string;
  episodes: Episode[];
}

export interface Episode extends CollectionEntry<'podcast'> {
  slug: string;
  number: number;
  guestDisplays: GuestDisplay[];
  previous?: Episode;
  next?: Episode;
  related: RelatedByGuest[];
}

export interface EpisodeArchiveGroup {
  id: string;
  label: string;
  episodes: Episode[];
}

export interface EpisodeData {
  episodes: Episode[];
  archiveGroups: EpisodeArchiveGroup[];
}

export function pageTitle(episode: Episode): string {
  const { title, guests } = episode.data;
  return guests.length ? `${title} (${guests.join(", ")})` : title;
}

function archiveGroupIdForSeason(season: number): string {
  if (season === 4 || season === 5) return "4-5";
  return String(season);
}

function archiveGroupLabel(groupId: string): string {
  if (groupId === "6") return "Internet Checkpoint";
  if (groupId === "2") return "Maintainers Anonymous";
  if (groupId === "4-5") return `فصل ${toPersianDigits("4/5")}`;  // ✅ localized
  if (groupId === "0") return "Early Episodes";
  // Convert the numeric part of groupId to Persian digits
  return `فصل ${toPersianDigits(groupId)}`;
}

export async function getEpisodeData(): Promise<EpisodeData> {
  const entries = (await getCollection("podcast")).sort((a, b) =>
    (b.data.season || 0) - (a.data.season || 0) || b.data.sidebar.order - a.data.sidebar.order);

  const guestCounts = new Map<string, number>();
  for (const entry of entries) {
    for (const guest of entry.data.guests) guestCounts.set(guest, (guestCounts.get(guest) ?? 0) + 1);
  }

  const episodes: Episode[] = entries.map((entry, index) => ({
    ...entry,
    slug: entry.id.split('/').pop() || '',
    number: entries.length - index,
    guestDisplays: entry.data.guests.map(name => ({ name, count: guestCounts.get(name) ?? 0 })),
    related: [],
  }));

  episodes.forEach((episode, index) => {
    episode.previous = episodes[index + 1];
    episode.next = episodes[index - 1];
    episode.related = episode.data.guests
      .map(guest => ({
        guest,
        episodes: episodes.filter(other => other !== episode && other.data.guests.includes(guest)),
      }))
      .filter(group => group.episodes.length > 0);
  });

  const archiveGroupMap = new Map<string, EpisodeArchiveGroup>();
  for (const episode of episodes) {
    const groupId = archiveGroupIdForSeason(episode.data.season || 0);
    const group = archiveGroupMap.get(groupId);
    if (group) group.episodes.push(episode);
    else archiveGroupMap.set(groupId, { id: groupId, label: archiveGroupLabel(groupId), episodes: [episode] });
  }

  return { episodes, archiveGroups: [...archiveGroupMap.values()] };
}
