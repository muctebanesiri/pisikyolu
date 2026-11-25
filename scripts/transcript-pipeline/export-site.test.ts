import { expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportSite } from './export-site';
import type { Json } from './python-compat';

const frontmatter = '---\r\ntitle: "Original title"\r\ndescription: Original description\r\n---\r\n';

function fixture(reading: Json[], raw: Json[]) {
  const root = mkdtempSync(join(tmpdir(), 'export-site-'));
  const episode = join(root, 'pilot');
  mkdirSync(episode);
  writeFileSync(join(episode, 'episode.json'), JSON.stringify({ state: 'review_draft', reading, raw, editorial: { headings: [] } }));
  const source = join(root, 'episode.md');
  writeFileSync(source, `${frontmatter}\r\nOriginal body.\r\n`);
  return { root, episode, source };
}

test('export keeps frontmatter bytes, aliases and same-second passages', () => {
  const reading = [
    { id: 'a', start: 1.2, speaker: 'Henry', text: 'First thought.', anchor: 'msg-1.2' },
    { id: 'b', start: 1.4, speaker: 'Guest', text: 'Second thought.', anchor: 'msg-1.4', reading_alias_anchors: ['msg-0.9'] },
  ];
  const { root, episode, source } = fixture(reading, [...reading.map((t) => ({ anchor: t.anchor })), { anchor: 'msg-0.9' }]);
  try {
    const ledger = exportSite(episode, source);
    const output = readFileSync(source, 'utf8');
    expect(output.startsWith(`${frontmatter}\r\n`)).toBe(true);
    expect(output.replaceAll('\r\n', '')).not.toContain('\n');
    for (const anchor of ['msg-1.2', 'msg-1.4', 'msg-0.9']) expect(output).toContain(`id="${anchor}"`);
    expect(Number(ledger.canonical_anchors_preserved)).toBe(3);
  } finally {
    rmSync(root, { recursive: true });
  }
});

test('lost or colliding anchors fail before writing', () => {
  for (const [raw, anchor] of [[[{ anchor: 'msg-missing' }], 'msg-1.2'], [[{ anchor: 'msg-1' }], 'msg-1']] as const) {
    const reading = [
      { id: 'a', start: 1.2, speaker: 'Henry', text: 'First thought.', anchor: 'msg-1.2' },
      { id: 'b', start: 2.4, speaker: 'Guest', text: 'Second thought.', anchor },
    ];
    const { root, episode, source } = fixture(reading, [...raw]);
    try {
      const original = readFileSync(source);
      expect(() => exportSite(episode, source)).toThrow();
      expect(readFileSync(source)).toEqual(original);
      expect(existsSync(join(episode, 'site-preview.json'))).toBe(false);
    } finally {
      rmSync(root, { recursive: true });
    }
  }
});
