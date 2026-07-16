const ONE_DAY_MS = 86_400_000;

function toPersianDigits(num: number | string): string {
  const str = String(num);
  const persianDigits: Record<string, string> = {
    '0': '۰', '1': '۱', '2': '۲', '3': '۳', '4': '۴',
    '5': '۵', '6': '۶', '7': '۷', '8': '۸', '9': '۹',
  };
  return str.replace(/\d/g, (d) => persianDigits[d] ?? d);
}

function padDatePart(value: number): string {
  return value.toString().padStart(2, "0");
}

export function formatEpisodeDate(date: Date): string {
  return date.toLocaleDateString("fa-IR", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatEpisodeDateValue(date: Date): string {
  return [
    date.getUTCFullYear(),
    padDatePart(date.getUTCMonth() + 1),
    padDatePart(date.getUTCDate()),
  ].join("-");
}

export function formatEpisodeRelativeDate(date: Date, now = new Date()): string {
  const currentDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const episodeDay = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const diffDays = Math.floor((currentDay - episodeDay) / ONE_DAY_MS);

  if (diffDays <= 0) return "بوپون";
  if (diffDays === 1) return "۱ گون قاباخ";  // manually set "۱"
  return `${toPersianDigits(diffDays)} گون قاباخ`;
}
