// Export an assembled reading draft into an existing episode's Markdown body.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ValueError, dumps, escapeHtml, get, loads, num, pathText, pySpace, strip, type Json } from './python-compat';

const sha256 = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
const unresolvedSpeaker = new RegExp(`^(?:speaker[${pySpace}]+(?:\\p{Nd}+|unknown)(?![\\p{L}\\p{N}_])|unconfirmed(?![\\p{L}\\p{N}_]))`, 'iu');

export function exportSite(episode: string, destination: string) {
  const source = join(episode, 'episode.json');
  const data = loads(readFileSync(source, 'utf8'));
  const original = new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(destination));
  const frontmatter = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(original)?.[0];
  if (frontmatter === undefined) throw new ValueError('Destination needs existing episode frontmatter');
  const visible: Json[] = data.reading.filter((t: Json) => strip(t.text));
  const headings = new Map<string, string>(get(data.editorial, 'headings', []).map((h: Json) => [h.turn_id, h.text]));
  const counts = new Map<number, number>();
  const owners = new Map<string, string>();
  for (const t of visible) {
    const second = Math.floor(num(t.start));
    const count = (counts.get(second) ?? 0) + 1;
    counts.set(second, count);
    owners.set(`msg-${second}` + (count > 1 ? `-${count}` : ''), t.id);
  }
  const emitted = new Set(owners.keys());
  const unresolved = visible.some((t) => unresolvedSpeaker.test(t.speaker));
  const note = 'Draft transcript.' + (unresolved ? ' Some speaker labels remain unconfirmed.' : '');
  const newline = frontmatter.includes('\r\n') ? '\r\n' : '\n';
  const lines = ['> ' + note, ''];
  for (const t of visible) {
    if (headings.has(t.id)) lines.push('#### ' + headings.get(t.id), '');
    let spans = '';
    for (const anchor of new Set<string>([t.anchor, ...get(t, 'alias_anchors', []), ...get(t, 'reading_alias_anchors', [])])) {
      if (owners.has(anchor) && owners.get(anchor) !== t.id) throw new ValueError(`Canonical anchor collides with another passage: ${anchor}`);
      if (!emitted.has(anchor)) {
        spans += `<span id="${escapeHtml(anchor)}"></span>`;
        emitted.add(anchor);
      }
    }
    const second = Math.floor(num(t.start));
    const pad = (n: number) => String(n).padStart(2, '0');
    const stamp = `${pad(Math.floor(second / 3600))}:${pad(Math.floor(second / 60) % 60)}:${pad(second % 60)}`;
    lines.push(`[${stamp}] **${t.speaker}:** ${spans}${t.text.replaceAll('\n\n', '<br /><br />')}`, '');
  }
  const required = new Set<string>(data.raw.map((t: Json) => t.anchor));
  if ([...required].some((anchor) => !emitted.has(anchor))) throw new ValueError('Reading export would lose canonical source anchors');
  const prefix = frontmatter.endsWith('\n') ? frontmatter : frontmatter + newline;
  writeFileSync(destination, prefix + newline + lines.join(newline));
  const ledger = { source: 'episode.json', source_sha256: sha256(readFileSync(source)), destination: pathText(destination),
    destination_sha256: sha256(readFileSync(destination)), state: data.state, visible_turns: BigInt(visible.length),
    headings: BigInt(headings.size), canonical_anchors_preserved: BigInt(required.size), unconfirmed_speakers: unresolved };
  writeFileSync(join(episode, 'site-preview.json'), dumps(ledger, { indent: 2 }) + '\n');
  return ledger;
}

if (import.meta.main) {
  const [episode, destination] = Bun.argv.slice(2);
  if (!episode || !destination) {
    console.error('Usage: bun scripts/transcript-pipeline/export-site.ts <episode> <destination.md>');
    process.exit(2);
  }
  try {
    console.log(dumps(exportSite(episode, destination)));
  } catch (error) {
    console.error(`${(error as Error).constructor.name}: ${(error as Error).message}`);
    process.exit(1);
  }
}
