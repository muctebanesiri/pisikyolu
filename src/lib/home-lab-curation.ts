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
      at: 322,
      text: "GPL لایسنسی ویروس کیمی بیر شئ دی",
    },
    assertion: {
      at: 522,
      text: "GNU project و Linux Kernal بیرلشیب و دنیانین لاپ خفن OS وجودا گلدی",
    },
    openLoop: {
      at: 1029,
      text: "",
    },
    lexicon: [
      { term: "GNU", anchors: [622] },
      { term: "Kernal", anchors: [844] },
      { term: "GPL", anchors: [2657] },
    ],
  },
];

export const HOME_LAB_CURATION_BY_SLUG = new Map(
  HOME_LAB_CURATION.map((entry) => [entry.slug, entry]),
);
