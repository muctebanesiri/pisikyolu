import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import pagefind from 'astro-pagefind';          // ✅ correct package
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  publicDir: "public",
  integrations: [
    preact({ compat: true }),
    pagefind(),                                 // ✅ generates search index
  ],
  vite: {
    plugins: [tailwindcss()],
    // no external/optimizeDeps for pagefind
  },
});
