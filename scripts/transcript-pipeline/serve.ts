// Serve a local review with byte ranges so long recordings can seek.
import { existsSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { dumps, equal, loads, type Json } from './python-compat';
import { parseArgs } from './pipeline';

const compactReply = resolve(import.meta.dir, '../../src/markdown/compact-reply.js');
const common = { 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes' };
const reply = (status: number, headers: Record<string, string> = {}, body: BodyInit | null = null) =>
  new Response(body, { status, headers: { ...headers, ...common } });

async function saveDecisions(root: string, request: Request) {
  if (request.headers.get('Origin') !== 'http://' + (request.headers.get('Host') ?? '')) return reply(403);
  try {
    const size = Number(request.headers.get('Content-Length') ?? '0');
    if (!Number.isInteger(size) || !(size > 0 && size <= 2_000_000)) throw new Error('Invalid size');
    const bytes = new Uint8Array(await request.arrayBuffer()).slice(0, size);
    const value = loads(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid review');
    const episode = loads(await Bun.file(join(root, 'episode.json')).text());
    const decisions = value.decisions;
    if (value.review_revision !== episode.review_revision || value.episode_id !== episode.manifest.episode_id ||
        !equal(value.audio_sha256 ?? null, episode.manifest.tracks.map((t: Json) => t.sha256)) ||
        !decisions || typeof decisions !== 'object' || Array.isArray(decisions))
      throw new Error('Stale or invalid review');
    const temporary = join(root, `.review-decisions-${crypto.randomUUID()}.tmp`);
    writeFileSync(temporary, dumps(value, { indent: 2 }));
    renameSync(temporary, join(root, 'review-decisions.json'));
  } catch {
    return reply(400);
  }
  return reply(204);
}

function sendFile(path: string, range: string | null) {
  const file = Bun.file(path);
  const type = file.type;
  if (!range) return reply(200, { 'Content-Type': type, 'Content-Length': String(file.size) }, file);
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  const size = file.size;
  if (!match || (!match[1] && !match[2])) return reply(400);
  const [, left, right] = match;
  const start = left ? Number(left) : Math.max(0, size - Number(right));
  const end = left && right ? Math.min(size - 1, Number(right)) : size - 1;
  if (start >= size || end < start) return reply(416, { 'Content-Range': `bytes */${size}`, 'Content-Length': '0' });
  return reply(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) },
    file.slice(start, end + 1));
}

export function serve(directory: string, port = 8768) {
  const root = resolve(directory);
  return Bun.serve({
    hostname: '127.0.0.1',
    port,
    async fetch(request) {
      const url = new URL(request.url);
      if (request.method === 'POST') return url.pathname === '/review-decisions.json' ? saveDecisions(root, request) : reply(404);
      if (request.method !== 'GET' && request.method !== 'HEAD') return reply(501);
      if (url.pathname === '/compact-reply.js') return sendFile(compactReply, request.headers.get('Range'));
      let path: string;
      try {
        path = resolve(root, '.' + decodeURIComponent(url.pathname));
      } catch {
        return reply(400);
      }
      if (path !== root && !path.startsWith(root + sep)) return reply(404);
      if (existsSync(path) && statSync(path).isDirectory()) path = join(path, 'index.html');
      if (!existsSync(path) || !statSync(path).isFile()) return reply(404);
      return sendFile(path, request.headers.get('Range'));
    },
  });
}

if (import.meta.main) {
  const { positional, options } = parseArgs(Bun.argv.slice(2));
  if (!positional[0]) {
    console.error('Usage: bun scripts/transcript-pipeline/serve.ts <episode> [--port 8768]');
    process.exit(2);
  }
  const server = serve(positional[0], options.port ? Number(options.port) : 8768);
  console.log(`Review: http://127.0.0.1:${server.port}/`);
}
