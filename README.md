# hopeinsource.com

The site for [Hope in Source](https://hopeinsource.com), a podcast you read: every episode is a full transcript, with audio and video as optional companions. A static Astro site with Pagefind search; no server or database.

## Run it

Needs Bun 1.4.2+ and Node 22.12+.

```sh
bun install
bun run dev
```

Search only works on a build: `bun run build && bun run preview`.

`bun run check` checks types, `bun run test` runs the tests, and `bun run test:transcripts` runs the Python transcript-tool tests.

## Where things live

- `src/content/podcast/`: one Markdown transcript per episode, grouped by season.
- `src/pages/`, `src/components/`, `src/scripts/`, `src/styles/`: the site.
- `scripts/transcript-pipeline/`: local transcript tools, with their own [README](scripts/transcript-pipeline/README.md).

## Don't break links

People share passages, so every `#t=<seconds>` and `#msg-<seconds>` link must keep working. When fixing a timestamp, keep the old ID as an alias: `<span id="msg-OLD"></span>`. Transcript edits remove filler only; never paraphrase. See [AGENTS.md](AGENTS.md).

## Deploy

Deploys to Cloudflare Pages from your machine; CI only tests.

```sh
bunx wrangler@4.140.0 login   # once
bun run deploy:preview        # preview URL
bun run deploy                # production
```
