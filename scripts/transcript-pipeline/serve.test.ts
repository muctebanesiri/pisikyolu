import { afterEach, beforeEach, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serve } from './serve';

let root: string;
let server: ReturnType<typeof serve>;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'review-server-'));
  writeFileSync(join(root, 'audio.mp3'), '0123456789');
  writeFileSync(join(root, 'episode.json'), JSON.stringify({ review_revision: 'revision',
    manifest: { episode_id: 'example', tracks: [{ sha256: 'audio-identity' }] } }));
  server = serve(root, 0);
});

afterEach(() => {
  server.stop(true);
  rmSync(root, { recursive: true });
});

const url = (path: string) => `http://127.0.0.1:${server.port}${path}`;
const save = (body: unknown, origin = `http://127.0.0.1:${server.port}`) =>
  fetch(url('/review-decisions.json'), { method: 'POST', body: JSON.stringify(body), headers: { Origin: origin } });

test('audio supports seeking and rejects unsatisfiable ranges', async () => {
  for (const [range, body, contentRange] of [['bytes=2-5', '2345', 'bytes 2-5/10'], ['bytes=8-', '89', 'bytes 8-9/10'], ['bytes=-3', '789', 'bytes 7-9/10']]) {
    const response = await fetch(url('/audio.mp3'), { headers: { Range: range } });
    expect(response.status).toBe(206);
    expect(await response.text()).toBe(body);
    expect(response.headers.get('Content-Range')).toBe(contentRange);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  }
  const response = await fetch(url('/audio.mp3'), { headers: { Range: 'bytes=10-' } });
  expect(response.status).toBe(416);
  expect(response.headers.get('Content-Range')).toBe('bytes */10');
  expect(await response.text()).toBe('');
});

test('review page can load the shared compact-reply module', async () => {
  const response = await fetch(url('/compact-reply.js'));
  expect(response.status).toBe(200);
  expect(await response.text()).toContain('export function isCompactReply');
});

test('invalid shapes and cross-origin saves are rejected', async () => {
  for (const value of [[], null, 'invalid']) expect((await save(value)).status).toBe(400);
  expect((await save({}, 'https://example.com')).status).toBe(403);
  expect(existsSync(join(root, 'review-decisions.json'))).toBe(false);
});

test('a save is durable and a stale revision cannot overwrite it', async () => {
  const value = { review_revision: 'revision', episode_id: 'example', audio_sha256: ['audio-identity'], decisions: { item: { state: 'skipped' } } };
  expect((await save(value)).status).toBe(204);
  const saved = readFileSync(join(root, 'review-decisions.json'));
  expect((await save({ ...value, review_revision: 'old' })).status).toBe(400);
  expect(readFileSync(join(root, 'review-decisions.json'))).toEqual(saved);
});
