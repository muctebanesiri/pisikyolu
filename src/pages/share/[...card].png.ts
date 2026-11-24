import type { APIRoute, GetStaticPaths } from "astro";
import { getEpisodeData } from "@/lib/episodes";
import { episodeCard, type EpisodeCard } from "@/lib/share-card";
import { renderEpisodeCard, renderShowCard } from "@/lib/render-share-card";

export const getStaticPaths = (async () => {
  const { episodes } = await getEpisodeData();
  return [
    { params: { card: "show" } },
    ...episodes.map(episode => ({ params: { card: `episode/${episode.slug}` }, props: { card: episodeCard(episode) } })),
  ];
}) satisfies GetStaticPaths;

export const GET: APIRoute<{ card?: EpisodeCard }> = async ({ props }) => {
  const png = props.card ? await renderEpisodeCard(props.card) : await renderShowCard();
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png" } });
};
