export interface AssertionCuration {
  at: number;
  text?: string;
}

export interface OpenLoopCuration {
  at: number;
  text?: string;
}

export interface LexiconSeedCuration {
  term: string;
  anchors: number[];
}

export interface EpisodeLabCuration {
  slug: string;
  assertion?: AssertionCuration;
  openLoop?: OpenLoopCuration;
  lexicon?: LexiconSeedCuration[];
}

// Manual curation lives here so we avoid frontmatter bloat.
// Add entries episode-by-episode as you read transcripts.
export const HOME_LAB_CURATION: EpisodeLabCuration[] = [
  {
    slug: "linux",
    assertion: {
      at: 1539,
      text: "واژه‌ها توتم‌هایی‌اند. اگر ریشه‌شناسی را بدانی. اگر نه، فقط به بالای توتم نگاه می‌کنی.",
    },
    openLoop: {
      at: 1029,
      text: "ما حتی کووید را هم درست سوگ‌وگار نگرفتیم، فقط تمام شد، اما کسی نگفت که تمام شده. آیین‌های ما چه شدند؟",
    },
    lexicon: [
      { term: "فراهم‌سازی", anchors: [1122] },
      { term: "روان‌جادو", anchors: [1050] },
      { term: "پسا-انتقادی", anchors: [2657] },
    ],
  },
  {
    slug: "ffmpeg",
    assertion: {
      at: 3343,
      text: "در این عصر هوش مصنوعی، تنها چیزی که داریم، تجربه‌های منحصربه‌فرد خودمان است.",
    },
    openLoop: {
      at: 3275,
      text: "برعکس کوشش، هیچ‌چیز نیست. در حالی که باید پرسید: چگونه بیشتر به‌وجود بیاییم؟",
    },
    lexicon: [
      { term: "پهنای باند زمانی", anchors: [4478] },
      { term: "وو-وی", anchors: [2754] },
      { term: "پیش‌زمینه-پس‌زمینه", anchors: [3844] },
    ],
  },
];

export const HOME_LAB_CURATION_BY_SLUG = new Map(
  HOME_LAB_CURATION.map((entry) => [entry.slug, entry]),
);
