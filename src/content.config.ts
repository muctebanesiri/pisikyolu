import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

const words = z.tuple([z.number().int().nonnegative(), z.number().int().positive()])
  .refine(([from, to]) => from < to, 'Word range must be [from, to) with from < to');

const moment = z.object({
  at: z.string().regex(/^msg-\d+(?:-\d+)?$/),
  words: words.optional(),
});

const podcastSchema = z.object({
  title: z.string(),
  guests: z.array(z.string().trim().min(1)),
  shareExcerpt: z.string().trim().min(1).optional(),
  season: z.number(),
  date: z.date(),
  time: z.string(),
  description: z.string(),
  episodeLink: z.string(),
  sauntercast: z.boolean().optional(),
  video: z.object({
    url: z.url(),
    offsetSeconds: z.number().int().nonnegative().optional(),
  }).optional(),
  sidebar: z.object({
    order: z.number(),
  }),
  speakers: z.record(z.string(), z.enum(['left', 'right', 'other'])).optional(),
  moments: z.array(moment.extend({
    preview: words.optional(),
    before: moment,
    after: moment.optional(),
  })).optional(),
});

// Define the podcast collection
const podcast = defineCollection({
  loader: glob({ 
    pattern: '**/[^_]*.md', 
    base: 'src/content/podcast' 
  }),
  schema: podcastSchema,
});

export const collections = { podcast };
