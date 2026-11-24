# Future

- **Search loader caching.** Cloudflare's zone settings stretch `/pagefind/pagefind.js` and `pagefind-worker.js` to a 31-day cache, ignoring `_headers`. Add a cache rule on hopeinsource.com and www that respects origin headers (needs zone access; the deploy login gets 403).
- **Type-check .astro files.** `bun check` skips the 13 `.astro` files, and `astro check` refuses TypeScript 7. When TypeScript 7.1 is stable, add `@astrojs/ts-content-mapper`.
- **Content Security Policy.** Astro's `security.csp` could lock down scripts on this static site. Pagefind's WebAssembly needs `'wasm-unsafe-eval'`, and it changes response headers, so it's its own change.
