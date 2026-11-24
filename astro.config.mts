import { defineConfig, passthroughImageService } from "astro/config";
import { satteri } from "@astrojs/markdown-satteri";
import tailwindcss from "@tailwindcss/vite";

import { transcriptMarkdown } from "./src/markdown";

// https://astro.build/config
export default defineConfig({
  compressHTML: true,
  vite: {
    plugins: [tailwindcss()],
  },
  markdown: {
    processor: satteri({ features: { smartPunctuation: false }, mdastPlugins: [transcriptMarkdown] }),
  },
  experimental: {
    chromeDevtoolsWorkspace: true,
  },
  image: {
    service: passthroughImageService(),
  },
});
