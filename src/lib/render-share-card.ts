import sharp from "sharp";
import artUrl from "../assets/cover-art.jpg?inline";
import { cardHeight, cardWidth, passageCredit, type EpisodeCard } from "./share-card";

const sky = "#0b0d08";
const cream = "#f4eedd";
const gold = "#f0be4a";
const art = Buffer.from(artUrl.split(",")[1], "base64");

function escapeXml(text: string) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function canvas(content: string) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${cardWidth}" height="${cardHeight}">
    <rect width="100%" height="100%" fill="${sky}"/>${content}</svg>`);
}

const sprout = (size: number) => sharp(art).extract({ left: 330, top: 250, width: 540, height: 540 }).resize(size).png().toBuffer();

async function typeBlock(value: string, font: string, size: number, width: number, height: number, color = cream) {
  const text = `<span foreground="${color}">${escapeXml(value)}</span>`;
  for (let points = size; points >= 12; points -= 2) {
    const result = await sharp({ text: { text, font: `${font} ${points}`, width, rgba: true, wrap: "word-char" } })
      .png().toBuffer({ resolveWithObject: true });
    if (result.info.height <= height) return result;
  }
  throw new Error(`Share card text does not fit: ${value}`);
}

export async function renderEpisodeCard(card: EpisodeCard) {
  const { passage } = card;
  const [headline, footer, credit] = await Promise.all([
    typeBlock(passage ? `“${passage.text}”` : card.title, "Georgia", 86, 1055, 262),
    typeBlock(passage ? card.title : card.guests.join(", ") || "Hope in Source", "Georgia", 36, 775, 76),
    passage && typeBlock(passageCredit(passage), "sans", 33, 1050, 52, gold),
  ]);
  const mark = await sprout(81);
  const top = Math.round(130 + (350 - headline.info.height - (credit ? credit.info.height + 30 : 0)) / 2);
  const plate = canvas(`
    <text x="160" y="77" font-family="Georgia, serif" fill="${cream}" font-size="33"><tspan font-style="italic">Hope in</tspan> Source</text>
    <text x="1138" y="75" text-anchor="end" font-family="monospace" font-size="22" fill="#b7c6c8">EP. ${String(card.number).padStart(2, "0")}</text>
    <path d="M62 504H1138" stroke="#425159" stroke-width="1.5"/>
    <text x="1138" y="568" text-anchor="end" font-family="monospace" font-size="27" fill="#bdcaca">${escapeXml(card.date)}</text>`);
  return sharp(plate).composite([
    { input: mark, left: 62, top: 18 },
    { input: headline.data, left: 58, top },
    ...(credit ? [{ input: credit.data, left: 64, top: top + headline.info.height + 30 }] : []),
    { input: footer.data, left: 62, top: Math.round(558 - footer.info.height / 2) },
  ]).png().toBuffer();
}

export async function renderShowCard() {
  const scene = await sharp(art).resize(1000).extract({ left: 0, top: 120, width: 1000, height: 630 }).toBuffer();
  const words = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${cardWidth}" height="${cardHeight}">
    <defs><linearGradient id="fade" x1="0" x2="1"><stop offset="0.25" stop-color="${sky}"/><stop offset="0.5" stop-color="${sky}" stop-opacity="0"/></linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#fade)"/>
    <g font-family="Georgia, serif">
      <text x="59" y="249" font-style="italic" font-size="115" fill="${gold}">Hope in</text>
      <text x="59" y="391" font-weight="bold" font-size="157" fill="${cream}">Source</text>
      <text x="64" y="563" font-size="38" fill="${cream}">off-the-cuff conversations between friends</text>
    </g></svg>`);
  return sharp(canvas("")).composite([{ input: scene, left: 300, top: 0 }, { input: words }]).png().toBuffer();
}
