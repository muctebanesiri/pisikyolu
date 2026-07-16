import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import pagefind from '@astrojs/pagefind';        // ✅ Pagefind integration
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  publicDir: "public",
  integrations: [
    preact({ compat: true }),
    pagefind(),                                 // ✅ Generates search index on build
  ],
  vite: {
    plugins: [tailwindcss()],
    // ⚠️ Removed: 'external' and 'optimizeDeps' – they break Pagefind
  },
});
