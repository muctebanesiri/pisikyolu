import { expect, test } from 'bun:test';
import {
  applyEdits, isSubtractive, labelWord, makeTurns, makeWords, preserveReadingAnchors, rebaseSegments,
  speakerHandoffCandidates, textDiff, validateEditorial, validateManifest,
} from './pipeline';
import { clone, type Json } from './python-compat';

const turn = (n: number, text: string, speaker = 'A'): Json =>
  ({ id: `t${n}`, anchor: `msg-${n}`, start: n, end: n + 0.9, speaker, text, word_ids: [`w${n}`] });
const cues = (before: string, after: string) =>
  new Set(textDiff(before, after).meaning_review.flatMap((signal: Json) => signal.cues));

test('fragmented handoff queue keeps canonical identity', () => {
  const turns = [turn(0, 'On okay', 'A'), turn(1, 'Some skipping', 'B'), turn(2, 'No worries but', 'A'), turn(3, 'Fine', 'B')];
  turns[1].id = 'frozen-57';
  turns[1].anchor = 'msg-419.04';
  const candidates = speakerHandoffCandidates(turns);
  expect(candidates).toHaveLength(1);
  expect(candidates[0].kind).toBe('speaker_handoff');
  expect(candidates[0].turn_ids).toEqual(['t0', 'frozen-57', 't2', 't3']);
  expect(candidates[0].context[1].anchor).toBe('msg-419.04');
  expect(Number(candidates[0].start)).toBe(0);
  expect(Number(candidates[0].end)).toBe(3.9);
  expect(turns[1].text).toBe('Some skipping');
});

test('handoff queue ignores acknowledgments and isolated short turns', () => {
  expect(speakerHandoffCandidates([turn(0, 'Yeah.', 'A'), turn(1, 'Okay.', 'B'), turn(2, 'Oh, cool.', 'A')])).toEqual([]);
  expect(speakerHandoffCandidates([turn(0, 'I want to record the ambience here.', 'A'),
    turn(1, 'Your surroundings.', 'B'), turn(2, 'That makes a lot of sense.', 'A')])).toEqual([]);
  expect(speakerHandoffCandidates([turn(0, 'On okay', 'A'), turn(1, 'Some skipping', 'B'), turn(4, 'No worries but', 'A')])).toEqual([]);
});

test('chunk frame rounding cannot shift the audio timeline', () => {
  const result = rebaseSegments([{ start: 5040, end: 5045.04, speaker: 1 }], 5040, 5000, 5);
  expect(result.map((s: Json) => [Number(s.start), Number(s.end), s.speaker])).toEqual([[5000, 5005, 1]]);
  expect(rebaseSegments([{ start: 5046, end: 5047, speaker: 1 }], 5040, 5000, 5)).toEqual([]);
});

test('meaning cues are flagged even when an edit only removes words', () => {
  expect(isSubtractive('I think maybe we should not do it, yet.', 'We should do it.')).toBe(true);
  const found = cues('I think maybe we should not do it, yet.', 'We should do it.');
  for (const cue of ['i think', 'maybe', 'not', 'yet']) expect(found.has(cue)).toBe(true);
  expect(isSubtractive("I can't say yes.", 'I say yes.')).toBe(true);
  expect(cues("I can't say yes.", 'I say yes.').has("can't")).toBe(true);
});

test('diff markup escapes source text', () => {
  const html = textDiff('<script>alert(1)</script> I guess yes.', 'Yes.').before_html;
  expect(html).not.toContain('<script>');
  expect(html).toContain('&lt;');
  expect(html).toContain('<del>');
});

test('removed acknowledgment keeps its anchors', () => {
  const reading = [turn(0, ''), turn(1, 'Hello.')];
  reading[0].alias_anchors = ['msg-0.5'];
  preserveReadingAnchors(reading);
  preserveReadingAnchors(reading);
  expect(reading[0].reading_merged_into).toBe('t1');
  expect(reading[1].reading_alias_anchors).toEqual(['msg-0', 'msg-0.5']);
});

test('zero-duration word inside an acoustic segment gets that speaker', () => {
  const [label, support, overlap] = labelWord({ start: 2, end: 2 }, [{ start: 1, end: 3, speaker: 0 }]);
  expect(label).toBe('0');
  expect(Number(support)).toBeLessThan(1);
  expect(overlap).toBe(false);
});

test('reading rejects paraphrase and reordering', () => {
  const source = [turn(0, 'I guess we could try it.')];
  for (const text of ['We should try it.', 'Try it, I guess.'])
    expect(() => applyEdits(source, { reading: [{ turn_id: 't0', text, reason: 'cleanup' }] })).toThrow();
  const [, reading] = applyEdits(source, { reading: [{ turn_id: 't0', text: 'We could try it.', reason: 'Example only.' }] });
  expect(reading[0].text).toBe('We could try it.');
  expect(source[0].text).toBe('I guess we could try it.');
});

test('correction requires evidence and the exact before text', () => {
  for (const [before, evidence] of [['wrong', 'model check'], ['I', '']])
    expect(() => applyEdits([turn(0, 'I')], { corrections: [{ turn_id: 't0', before, after: 'We', evidence }] })).toThrow();
});

test('boundaries and joins keep words, anchors and raw turns', () => {
  const raw = [turn(0, 'So we need'), turn(1, 'to', 'unknown'), turn(2, 'think.')];
  const original = clone(raw);
  const [corrected] = applyEdits(raw, {
    speakers: [{ turn_id: 't1', before: 'unknown', after: 'A', evidence: 'neighboring audio' }],
    joins: [{ turn_ids: ['t0', 't1', 't2'], evidence: 'continuous sentence' }],
  });
  expect(raw).toEqual(original);
  expect(corrected[0].text).toBe('So we need to think.');
  expect(corrected[0].word_ids).toEqual(['w0', 'w1', 'w2']);
  expect(corrected[0].alias_anchors).toEqual(['msg-1', 'msg-2']);
  expect(corrected[1].merged_into).toBe('t0');
  const a = { ...turn(0, 'Hi do'), word_ids: ['w0', 'w1'] };
  const b = { ...turn(1, 'you agree?', 'B'), word_ids: ['w2', 'w3'] };
  const [moved] = applyEdits([a, b], { boundaries: [{ from: 't0', to: 't1', text: 'do', word_count: 1, evidence: 'handoff' }] });
  expect(moved.map((t: Json) => t.text)).toEqual(['Hi', 'do you agree?']);
  expect(moved.flatMap((t: Json) => t.word_ids)).toEqual(['w0', 'w1', 'w2', 'w3']);
});

test('cannot merge distinct speakers or nonadjacent turns', () => {
  const raw = [turn(0, 'A'), turn(1, 'B', 'B'), turn(2, 'C')];
  for (const ids of [['t0', 't1'], ['t0', 't2']])
    expect(() => applyEdits(raw, { joins: [{ turn_ids: ids, evidence: 'test' }] })).toThrow();
});

test('two tracks keep offsets, overlap and every word', () => {
  const m: Json = { mode: 'speaker_tracks', tracks: [
    { id: 'a', speaker: 'Henry', duration: 10, offset_seconds: 0 },
    { id: 'b', speaker: 'Nadia', duration: 10, offset_seconds: 0.5 }] };
  const output = (words: Json[]) => ({ segments: [{ id: 0, words }] });
  const words = makeWords(m, {
    a: output([{ word: 'One', start: 1, end: 1.4 }, { word: 'sentence.', start: 1.4, end: 2 }]),
    b: output([{ word: 'Yes.', start: 0.7, end: 1 }]),
  }, []);
  const turns = makeTurns(words);
  expect(turns.map((t) => t.text)).toEqual(['One sentence.', 'Yes.']);
  expect(Number(turns[1].start)).toBe(1.2);
  expect(turns[1].speaker).toBe('Nadia');
  expect(turns.flatMap((t) => t.word_ids).sort()).toEqual(words.map((w: Json) => w.id).sort());
  expect(Number(turns[0].end)).toBeGreaterThan(Number(turns[1].start));
  delete m.tracks[1].offset_seconds;
  expect(() => validateManifest(m)).toThrow();
});

test('coincident turns get unique links without invented times', () => {
  const words: Json[] = ['A', 'B', 'A'].map((s, i) => ({ id: `w${i}`, track_id: 'a', speaker: s, start: 1.2, end: 1.2, text: s }));
  let turns = makeTurns(words);
  expect(turns.map((t) => t.anchor)).toEqual(['msg-1.2', 'msg-1.2-2', 'msg-1.2-3']);
  expect(turns.map((t) => Number(t.start))).toEqual([1.2, 1.2, 1.2]);
  expect(turns.flatMap((t) => t.word_ids)).toEqual(['w0', 'w1', 'w2']);
  words[1].track_id = 'b';
  turns = makeTurns(words);
  expect(new Set(turns.map((t) => t.anchor)).size).toBe(turns.length);
  expect(turns.every((t) => Number(t.start) === 1.2)).toBe(true);
});

test('verbatim titles must quote the transcript', () => {
  const turns = [turn(0, 'You are showing up for a reason.')];
  validateEditorial({ titles: [{ text: 'Showing up for a reason', kind: 'verbatim', source_quote: 'showing up for a reason', turn_id: 't0' }] }, turns);
  expect(() => validateEditorial({ titles: [{ text: 'Community changes everything', kind: 'verbatim',
    source_quote: 'Community changes everything', turn_id: 't0' }] }, turns)).toThrow();
});

test('restored words keep their source timing', () => {
  const [c] = applyEdits([turn(0, 'It says:')], { restorations: [{ turn_id: 't0', track_id: 'a', source_file: 'raw/clip.json',
    evidence: 'second pass', words: [{ word: 'Hello.', start: 1.1, end: 1.5 }] }] });
  expect(c[0].text).toBe('It says: Hello.');
  expect(Number(c[0].end)).toBe(1.5);
  expect(Number(c[0].restored_words[0].start)).toBe(1.1);
});
