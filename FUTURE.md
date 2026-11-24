# Future

- **Search loader caching.** Cloudflare's zone settings stretch `/pagefind/pagefind.js` and `pagefind-worker.js` to a 31-day cache, ignoring `_headers`. Add a cache rule on hopeinsource.com and www that respects origin headers (needs zone access; the deploy login gets 403).
- **Pagefind retries.** Upstream retry fixes (pagefind#1329) aren't in 1.5.2. When they ship, drop our reconnect-and-retry layer in search.
