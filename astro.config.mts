import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import pagefind from '@stanniel/astro-pagefind';   // ✅ correct package
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  publicDir: "public",
  integrations: [
    preact({ compat: true }),
    pagefind(),                                    // ✅ works with Astro 6
  ],
  vite: {
    plugins: [tailwindcss()],
    // No external/optimizeDeps needed
  },
});
