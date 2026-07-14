<<<<<<< HEAD
import { defineCollection, z } from 'astro:content';
=======
import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
>>>>>>> upstream/main
import { glob } from 'astro/loaders';

const podcastSchema = z.object({
  title: z.string(),
  season: z.number(),
  date: z.date(),
  time: z.string(),
  description: z.string(),
  episodeLink: z.string(),
<<<<<<< HEAD
  embedUrl: z.string(),
=======
  sauntercast: z.boolean().optional(),
  video: z.object({
    url: z.url(),
    offsetSeconds: z.number().int().nonnegative().optional(),
  }).optional(),
>>>>>>> upstream/main
  sidebar: z.object({
    order: z.number(),
  }),
  speakers: z.record(z.string(), z.enum(['left', 'right', 'other'])).optional(),
<<<<<<< HEAD
=======
  quotes: z.array(
    z.object({
      text: z.string(),
      speaker: z.string(),
      timestamp: z.string(),
      topic: z.string().optional(),
    })
  ).max(2).optional(),
>>>>>>> upstream/main
});

// Define the podcast collection
const podcast = defineCollection({
  loader: glob({ 
    pattern: '**/[^_]*.md', 
    base: 'src/content/podcast' 
  }),
  schema: podcastSchema,
});

<<<<<<< HEAD
export const collections = { podcast };
=======
export const collections = { podcast };
>>>>>>> upstream/main
