import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import pagefind from '@stanniel/astro-pagefind';   // correct import
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  publicDir: "public",
  integrations: [
    preact({ compat: true }),
    pagefind(),                                    // <-- must be called
  ],
  vite: {
    plugins: [tailwindcss()],
    // Do NOT exclude pagefind in 'external' or 'optimizeDeps'
  },
});
