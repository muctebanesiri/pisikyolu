import sharp from "sharp";
import wellspring from "../assets/wellspring.svg?raw";
import { cardHeight, cardWidth, passageCredit, type EpisodeCard } from "./share-card";

const sky = "#0a1622";
const ground = "#07101a";
const cream = "#f4eedd";
const gold = "#f0be4a";
const sunriseImage = `data:image/svg+xml;base64,${Buffer.from(wellspring).toString("base64")}`;

function escapeXml(text: string) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function canvas(content: string) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${cardWidth}" height="${cardHeight}">
    <rect width="100%" height="100%" fill="${sky}"/>${content}</svg>`);
}

function sunrise(x: number, y: number, width: number) {
  return `<image x="${x}" y="${y}" width="${width}" height="${width / 2}" href="${sunriseImage}"/>`;
}

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
  const top = Math.round(130 + (350 - headline.info.height - (credit ? credit.info.height + 30 : 0)) / 2);
  const plate = canvas(`
    ${sunrise(62, 40, 81)}
    <text x="160" y="77" font-family="Georgia, serif" fill="${cream}" font-size="33"><tspan font-style="italic">Hope in</tspan> Source</text>
    <text x="1138" y="75" text-anchor="end" font-family="monospace" font-size="22" fill="#b7c6c8">EP. ${String(card.number).padStart(2, "0")}</text>
    <path d="M62 504H1138" stroke="#425159" stroke-width="1.5"/>
    <text x="1138" y="568" text-anchor="end" font-family="monospace" font-size="27" fill="#bdcaca">${escapeXml(card.date)}</text>`);
  return sharp(plate).composite([
    { input: headline.data, left: 58, top },
    ...(credit ? [{ input: credit.data, left: 64, top: top + headline.info.height + 30 }] : []),
    { input: footer.data, left: 62, top: Math.round(558 - footer.info.height / 2) },
  ]).png().toBuffer();
}

export async function renderShowCard() {
  return sharp(canvas(`
    ${sunrise(518, 36, 884)}
    <rect y="478" width="1200" height="152" fill="${ground}"/>
    <g font-family="Georgia, serif" fill="${cream}">
      <text x="59" y="249" font-style="italic" font-size="115">Hope in</text>
      <text x="59" y="391" font-weight="bold" font-size="157">Source</text>
      <text x="64" y="563" font-size="38">off-the-cuff conversations between friends</text>
    </g>`)).png().toBuffer();
}
