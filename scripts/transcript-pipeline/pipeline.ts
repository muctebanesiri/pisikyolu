// Local podcast pipeline. Model outputs are immutable; edits are replayed separately.
// All audio time is seconds on the original episode timeline. Two-track inputs must be
// isolated speaker tracks with explicit offsets; never concatenate them.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  SequenceMatcher, ValueError, add, clone, compareText, dumps, equal, escapeHtml, fixed, floatRepr, g, get, has,
  keys, loads, max2, min2, norm, num, parseFloatArg, pathText, round, rstrip, spaces, strip, sub, sum, truthy,
  wordPattern, type Json,
} from './python-compat';

const here = import.meta.dir;

export const read = (path: string): Json => loads(readFileSync(path, 'utf8'));

export function save(path: string, value: Json) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path + '.tmp', dumps(value, { indent: 2, ascii: false }) + '\n');
  renameSync(path + '.tmp', path);
}

const sha256 = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');
const fileSha = (path: string) => sha256(readFileSync(path));

export function stamp(t: Json) {
  const whole = Math.trunc(num(t));
  const pad = (n: number) => String(n).padStart(2, '0');
  const seconds = typeof t === 'bigint' ? t % 60n : num(t) % 60;
  return `${pad(Math.floor(whole / 3600))}:${pad(Math.floor(whole / 60) % 60)}:${fixed(seconds, 3).padStart(6, '0')}`;
}

function run(command: string[], env?: Record<string, string>) {
  const result = Bun.spawnSync(command, { stdout: 'pipe', stderr: 'inherit', env: env ?? process.env as Record<string, string> });
  if (result.exitCode !== 0) throw new Error(`Command failed (${result.exitCode}): ${command.join(' ')}`);
  return result.stdout.toString();
}

export function probe(path: string) {
  const data = loads(run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration:stream=codec_type,channels,sample_rate', '-of', 'json', path]));
  return { duration: parseFloatArg(data.format.duration), streams: data.streams };
}

export function validateManifest(m: Json) {
  const tracks = m.tracks;
  if (m.mode === 'mixed') {
    if (tracks.length !== 1) throw new ValueError('mixed mode requires exactly one recording');
  } else if (m.mode === 'speaker_tracks') {
    if (tracks.length !== 2 || new Set(tracks.map((t: Json) => t.speaker)).size !== 2)
      throw new ValueError('speaker_tracks requires two named isolated speaker tracks');
  } else throw new ValueError('Choose mixed or speaker_tracks explicitly');
  for (const t of tracks)
    if (!has(t, 'offset_seconds') || num(t.offset_seconds) < 0)
      throw new ValueError('Every track needs an explicit, nonnegative timeline offset');
}

const suffix = (path: string) => {
  const name = path.split('/').pop()!;
  const dot = name.lastIndexOf('.');
  return dot > 0 && dot < name.length - 1 ? name.slice(dot) : '';
};

export function ingest(episode: string, audio: string | undefined, trackArgs: string[], offsetArgs: string[]) {
  if (existsSync(join(episode, 'manifest.json')))
    throw new ValueError('Episode already exists; use a new directory to preserve its raw state');
  const sources: [string | null, string, number][] = audio ? [[null, audio, 0]] : [];
  const pair = (item: string) => {
    const at = item.indexOf('=');
    if (at < 0) throw new ValueError(`dictionary update sequence element has length 1; 2 is required: ${item}`);
    return [item.slice(0, at), item.slice(at + 1)];
  };
  const offsets = new Map(offsetArgs.map(pair) as [string, string][]);
  for (const item of trackArgs) {
    const [name, path] = pair(item);
    if (!offsets.has(name)) throw new ValueError(`Provide --offset ${name}=0 (or the measured offset) explicitly`);
    sources.push([name, path, parseFloatArg(offsets.get(name)!)]);
  }
  const m: Json = { schema: 1n, episode_id: pathText(episode).split('/').pop(), mode: audio ? 'mixed' : 'speaker_tracks',
    tracks: [], speaker_names: {}, speaker_name_evidence: {}, state: 'ingested' };
  sources.forEach(([speaker, source, offset], i) => {
    const path = realpathSync(source.replace(/^~(?=\/|$)/, homedir()));
    m.tracks.push({ id: `track-${i}`, audio: `input-${i}${suffix(path)}`, source_path: path, sha256: fileSha(path),
      speaker, offset_seconds: offset, ...probe(path) });
  });
  validateManifest(m);
  mkdirSync(episode, { recursive: true });
  for (const t of m.tracks) {
    const target = join(episode, t.audio);
    copyFileSync(t.source_path, target);
    const stat = statSync(t.source_path);
    utimesSync(target, stat.atime, stat.mtime);
  }
  save(join(episode, 'manifest.json'), m);
  console.log(`Ingested ${m.tracks.length} recording(s); originals untouched`);
}

type Runtime = { python: string; model: string; device?: string; stream_audio?: boolean };

export function runtime(configPath: string, stage: 'transcribe' | 'diarize' | 'crosscheck'): Runtime {
  return read(configPath)[stage];
}

function model(config: Runtime, command: string, audio: string, extra: string[] = []): { seconds: number; result: Json } {
  const folder = mkdtempSync(join(tmpdir(), 'transcript-model-'));
  try {
    const output = join(folder, 'output.json');
    const result = Bun.spawnSync([config.python, join(here, 'models.py'), command, audio, output, '--model', config.model, ...extra], {
      stdout: 'inherit', stderr: 'inherit', env: { ...process.env, HF_HUB_OFFLINE: '1', HF_HUB_DISABLE_TELEMETRY: '1' } as Record<string, string>,
    });
    if (result.exitCode !== 0) throw new Error(`Model runner failed (${result.exitCode}): ${command}`);
    const value = read(output);
    return { seconds: num(value.seconds), result: value.result };
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

const monoWav = (source: string, target: string) => {
  mkdirSync(dirname(target), { recursive: true });
  run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', source, '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', target]);
};

export function transcribe(episode: string, config: Runtime) {
  const m = read(join(episode, 'manifest.json'));
  validateManifest(m);
  for (const t of m.tracks) {
    const output = join(episode, 'raw', `${t.id}.json`);
    if (existsSync(output)) { console.log(`Keeping existing raw output ${pathText(output)}`); continue; }
    const { seconds, result } = model(config, 'whisper', join(episode, t.audio));
    save(output, result);
    save(output.replace(/\.json$/, '.metrics.json'), { seconds, model: config.model, language: 'en', word_timestamps: true,
      temperature: 0n, condition_on_previous_text: false });
  }
}

export function rebaseSegments(segments: Json[], modelOffset: number, audioOffset: number, duration: number) {
  const result: Json[] = [];
  for (const segment of segments) {
    const start = max2(0n, min2(duration, sub(segment.start, modelOffset)));
    const end = max2(0n, min2(duration, sub(segment.end, modelOffset)));
    if (num(end) > num(start)) result.push({ ...segment, start: add(start, audioOffset), end: add(end, audioOffset) });
  }
  return result;
}

export function diarize(episode: string, config: Runtime) {
  const m = read(join(episode, 'manifest.json'));
  validateManifest(m);
  if (m.mode === 'speaker_tracks') { console.log('Speaker identity comes from the isolated input tracks; no diarizer needed'); return; }
  const output = join(episode, 'raw', 'diarization.json');
  if (existsSync(output)) { console.log('Keeping existing diarization'); return; }
  if (!config.stream_audio) {
    const { seconds, result } = model(config, 'diarize', join(episode, m.tracks[0].audio));
    save(output, { model: config.model, seconds, segments: result });
    return;
  }
  const started = performance.now();
  const audio = join(episode, 'raw', 'diarization-input.wav');
  monoWav(join(episode, m.tracks[0].audio), audio);
  const prepared = (performance.now() - started) / 1000;
  const { seconds, result } = model(config, 'diarize', audio, ['--stream']);
  const segments = result.flatMap((chunk: Json) => rebaseSegments(chunk.segments, num(chunk.model_offset), num(chunk.audio_offset), num(chunk.duration)));
  save(output, { model: config.model, seconds: prepared + seconds, mode: 'stateful_audio_chunks', chunk_seconds: 5n, sample_rate: 16000n,
    timeline: 'sample-count rebased; model frame rounding does not accumulate', segments });
}

export function crosscheck(episode: string, config: Runtime) {
  const m = read(join(episode, 'manifest.json'));
  validateManifest(m);
  const device = config.device ?? 'cpu';
  for (const track of m.tracks) {
    const output = join(episode, 'raw', `crosscheck-${track.id}.json`);
    if (existsSync(output)) { console.log(`Keeping existing cross-check ${pathText(output)}`); continue; }
    // Some MP3 decoders yield samples just outside [-1, 1], which Redux rejects; it gets a PCM copy.
    const analysis = join(episode, 'raw', `crosscheck-input-${track.id}.wav`);
    monoWav(join(episode, track.audio), analysis);
    const { seconds, result } = model(config, 'crosscheck', analysis, ['--device', device]);
    save(output, result);
    save(output.replace(/\.json$/, '.metrics.json'), { seconds, model: config.model, device, timestamps: 'word',
      source_sha256: track.sha256, analysis_audio: pathText(analysis), analysis_sha256: fileSha(analysis),
      analysis_format: 'mono 16kHz PCM16; original audio unchanged' });
  }
}

export function recheck(episode: string, config: Runtime, trackId: string, clipStart: number, clipEnd: number) {
  const m = read(join(episode, 'manifest.json'));
  const track = m.tracks.find((t: Json) => t.id === trackId);
  if (!track) throw new Error(`No track ${trackId}`);
  const start = num(sub(clipStart, track.offset_seconds)), end = num(sub(clipEnd, track.offset_seconds));
  if (!(0 <= start && start < end && end <= num(track.duration)))
    throw new ValueError('Excerpt must be within this input track on the episode timeline');
  const output = join(episode, 'raw', 'excerpts', `${trackId}-${g(clipStart)}-${g(clipEnd)}.json`);
  if (existsSync(output)) { console.log(`Keeping existing excerpt ${pathText(output)}`); return; }
  mkdirSync(dirname(output), { recursive: true });
  const clip = output.replace(/\.json$/, '.wav');
  run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-ss', floatRepr(start), '-i', join(episode, track.audio),
    '-t', floatRepr(end - start), '-ar', '16000', '-ac', '1', clip]);
  const { seconds, result } = model(config, 'whisper', clip, ['--excerpt']);
  save(output, { clip_start_seconds: clipStart, clip_end_seconds: clipEnd, track_id: track.id, source_sha256: track.sha256,
    model: config.model, seconds, result });
  console.log(result.text);
}

type Label = [string, Json, boolean];

export function labelWord(word: Json, segments: Json[]): Label {
  const start = num(word.start), end = num(word.end);
  if (start === end) {
    // A zero-length ASR word can sit inside an acoustic turn; keep its time and low support.
    const containing = new Set(segments.filter((s) => num(s.start) <= start && start < num(s.end)).map((s) => String(s.speaker)));
    if (containing.size === 1) return [[...containing][0], 0.15, false];
    if (containing.size > 1) return ['unknown', 0n, true];
  }
  const duration = Math.max(end - start, 0.02);
  const scores = new Map<string, number>();
  for (const s of segments) {
    const overlap = Math.max(0, Math.min(end, num(s.end)) - Math.max(start, num(s.start)));
    if (overlap) {
      const speaker = String(s.speaker);
      scores.set(speaker, (scores.get(speaker) ?? 0) + overlap);
    }
  }
  const ranked = [...scores].sort((a, b) => b[1] - a[1]);
  if (!ranked.length) {
    // Bridge a short gap only when both neighboring segments name the same speaker.
    const before = segments.filter((s) => num(s.end) <= start).reduce<Json>((best, s) => (best === null || num(s.end) > num(best.end) ? s : best), null);
    const after = segments.filter((s) => num(s.start) >= end).reduce<Json>((best, s) => (best === null || num(s.start) < num(best.start) ? s : best), null);
    if (before && after && before.speaker === after.speaker && num(after.start) - num(before.end) <= 2) return [String(before.speaker), 0.25, false];
    const distance = (s: Json) => Math.min(Math.abs(start - num(s.end)), Math.abs(end - num(s.start)));
    const near = segments.reduce<Json>((best, s) => (best === null || distance(s) < distance(best) ? s : best), null);
    if (near && distance(near) <= 0.12) return [String(near.speaker), 0.15, false];
    return ['unknown', 0n, false];
  }
  const [speaker, weight] = ranked[0];
  const ratio = weight / duration;
  return [speaker, ratio < 1 ? ratio : 1n, ranked.length > 1 && ranked[1][1] / duration > 0.25];
}

export function makeWords(m: Json, rawByTrack: Record<string, Json>, segments: Json[]) {
  validateManifest(m);
  const words: Json[] = [];
  for (const track of m.tracks) {
    const raw = rawByTrack[track.id];
    let n = 0;
    for (const s of raw.segments) {
      for (const word of get(s, 'words', [])) {
        const w: Json = { id: `${track.id}-w${String(n).padStart(5, '0')}`, track_id: track.id, text: strip(word.word),
          start: round(add(word.start, track.offset_seconds), 3), end: round(add(word.end, track.offset_seconds), 3),
          probability: get(word, 'probability', null), asr_segment: s.id };
        if (!(0 <= num(w.start) && num(w.start) <= num(w.end) && num(w.end) <= num(add(add(track.duration, track.offset_seconds), 0.1))))
          throw new ValueError(`Invalid word time: ${w.id}`);
        if (m.mode === 'speaker_tracks') Object.assign(w, { speaker: track.speaker, speaker_support: 1n, overlap: false });
        else {
          const [speaker, support, overlap] = labelWord(w, segments);
          Object.assign(w, { speaker: get(get(m, 'speaker_names', {}), speaker, `Speaker ${speaker}`), speaker_cluster: speaker,
            speaker_support: support, overlap });
        }
        words.push(w);
        n++;
      }
    }
  }
  return words.sort((a, b) => num(a.start) - num(b.start) || compareText(a.track_id, b.track_id) || compareText(a.id, b.id));
}

export function assignTurnAnchors(turns: Json[]) {
  const counts = new Map<string, number>();
  for (const turn of turns) {
    const base = `msg-${g(turn.start)}`;
    const count = (counts.get(base) ?? 0) + 1;
    counts.set(base, count);
    turn.anchor = base + (count > 1 ? `-${count}` : '');
  }
  return turns;
}

export function makeTurns(words: Json[], gap = 3): Json[] {
  const tracks = [...new Set(words.map((w) => w.track_id as string))];
  if (tracks.length > 1) {
    // Keep each isolated speaker's utterance intact during simultaneous speech.
    const groups = tracks.sort(compareText).flatMap((track) => makeTurns(words.filter((w) => w.track_id === track), 0.8));
    groups.sort((a, b) => num(a.start) - num(b.start) || compareText(a.word_ids[0], b.word_ids[0]));
    groups.forEach((t, i) => { t.id = `turn-${String(i).padStart(4, '0')}`; });
    return assignTurnAnchors(groups);
  }
  const turns: Json[] = [];
  for (const w of words) {
    const prev = turns.at(-1);
    const split = !prev || prev.speaker !== w.speaker || num(w.start) - num(prev.end) > gap ||
      (prev.word_ids.length >= 65 && /[.!?]["']?\n?$/.test(prev.text));
    if (split) turns.push({ id: `turn-${String(turns.length).padStart(4, '0')}`, anchor: `msg-${g(w.start)}`, speaker: w.speaker,
      start: w.start, end: w.end, word_ids: [w.id], text: w.text });
    else {
      prev.word_ids.push(w.id);
      prev.text += ' ' + w.text;
      prev.end = max2(prev.end, w.end);
    }
  }
  return assignTurnAnchors(turns);
}

export function isSubtractive(before: string, after: string) {
  const source = norm(before);
  let i = 0;
  return norm(after).every((token) => {
    while (i < source.length) if (source[i++] === token) return true;
    return false;
  });
}

const isDigit = (token: string) => /^[\p{Nd}²³¹⁰⁴-⁹₀-₉①-⑨⑴-⑼⒈-⒐⓪⓵-⓽⓿❶-❾➀-➈➊-➒\u{10a40}-\u{10a43}]+$/u.test(token);
const cues = new Set(['maybe', 'might', 'could', 'perhaps', 'probably', 'yet', 'but', 'not', 'never', 'only', 'always', 'everyone', 'all', 'some']);
const negatives = new Set(['no', 'neither', 'nor', 'nobody', 'nothing', 'without']);
const hedges = ['i think', 'i guess', "i don't know", 'i feel', 'i wonder', 'kind of', 'sort of'];

export function textDiff(before: string, after: string) {
  const a = [...before.matchAll(wordPattern())], b = [...after.matchAll(wordPattern())];
  const tokens = (matches: RegExpMatchArray[]) => matches.map((m) => m[0].toLowerCase().replaceAll('’', "'"));
  const end = (m: RegExpMatchArray) => m.index! + m[0].length;
  const deleted: Json[] = [], left: [number, number][] = [], right: [number, number][] = [];
  for (const [tag, i, j, k, l] of new SequenceMatcher(tokens(a), tokens(b)).opcodes()) {
    if (tag === 'delete' || tag === 'replace') {
      const start = a[i].index!, stop = end(a[j - 1]);
      left.push([start, stop]);
      const context = Array.from(before.slice(0, start)).slice(-45).join('') + before.slice(start, stop) + Array.from(before.slice(stop)).slice(0, 45).join('');
      deleted.push({ text: before.slice(start, stop), context });
    }
    if (tag === 'insert' || tag === 'replace') right.push([b[k].index!, end(b[l - 1])]);
  }
  const mark = (text: string, spans: [number, number][], tag: string) => {
    let result = '', pos = 0;
    for (const [start, stop] of spans) {
      result += escapeHtml(text.slice(pos, start)) + `<${tag}>` + escapeHtml(text.slice(start, stop)) + `</${tag}>`;
      pos = stop;
    }
    return result + escapeHtml(text.slice(pos));
  };
  const signals: Json[] = [];
  for (const item of deleted) {
    const ts = norm(item.text), joined = ts.join(' ');
    // A deleted contracted negative matters as much as a deleted "not".
    const words = new Set(ts.filter((t) => cues.has(t) || t.endsWith("n't") || negatives.has(t)));
    const phrases = hedges.filter((phrase) => joined.includes(phrase));
    const extra = [...(ts.length >= 8 ? ['long deletion'] : []), ...(ts.some(isDigit) ? ['number'] : [])];
    if (words.size || phrases.length || extra.length) signals.push({ ...item, cues: [...[...words].sort(compareText), ...phrases, ...extra] });
  }
  return { before_html: mark(before, left, 'del'), after_html: mark(after, right, 'ins'), removed: deleted, meaning_review: signals };
}

export function preserveReadingAnchors(reading: Json[]) {
  const visible = reading.filter((t) => t.text);
  for (const t of reading) {
    if (t.text || truthy(get(t, 'merged_into')) || !visible.length) continue;
    const target = visible.find((v) => num(v.start) >= num(t.start)) ?? visible.at(-1);
    t.reading_merged_into = target.id;
    for (const anchor of [t.anchor, ...get(t, 'alias_anchors', [])]) {
      if (anchor !== target.anchor && !get(target, 'reading_alias_anchors', []).includes(anchor)) {
        if (!has(target, 'reading_alias_anchors')) target.reading_alias_anchors = [];
        target.reading_alias_anchors.push(anchor);
      }
    }
  }
}

const replaceFirst = (text: string, before: string, after: string) => {
  const at = text.indexOf(before);
  return at < 0 ? text : text.slice(0, at) + after + text.slice(at + before.length);
};

const describe = (e: Json) => dumps(e);

export function applyEdits(turns: Json[], edits: Json): [Json[], Json[], Json[]] {
  const result = clone(turns);
  const byId = new Map<string, Json>(result.map((t: Json) => [t.id, t]));
  const turn = (id: string) => { const t = byId.get(id); if (!t) throw new Error(`KeyError: ${id}`); return t; };
  const log: Json[] = [];
  // Repair turn boundaries before wording. Moves and joins conserve every source word.
  for (const e of get(edits, 'speakers', [])) {
    const t = turn(e.turn_id);
    if (t.speaker !== e.before || !truthy(get(e, 'evidence'))) throw new ValueError(`Speaker correction failed validation: ${describe(e)}`);
    t.speaker = e.after;
    log.push({ ...e, kind: 'speaker' });
  }
  for (const e of get(edits, 'boundaries', [])) {
    const a = turn(e.from), b = turn(e.to);
    if (result.indexOf(b) !== result.indexOf(a) + 1 || !truthy(get(e, 'evidence')))
      throw new ValueError('Boundary move must be forward to the adjacent turn, with evidence');
    const phrase: string = e.text;
    if (!a.text.endsWith(phrase) || !a.word_ids.length) throw new ValueError(`Boundary suffix does not match: ${describe(e)}`);
    const count = num(e.word_count);
    if (count < 1 || count > a.word_ids.length) throw new ValueError('Invalid boundary word count');
    b.word_ids = [...a.word_ids.slice(-count), ...b.word_ids];
    a.word_ids = a.word_ids.slice(0, -count);
    b.text = phrase + ' ' + b.text;
    a.text = rstrip(phrase.length ? a.text.slice(0, -phrase.length) : '');
    log.push({ ...e, turn_id: b.id, kind: 'boundary' });
  }
  for (const e of get(edits, 'joins', [])) {
    const group: Json[] = e.turn_ids.map(turn);
    const indexes = group.map((t) => result.indexOf(t));
    if (indexes.some((index, n) => index !== indexes[0] + n) || !truthy(get(e, 'evidence')))
      throw new ValueError('Join must use adjacent turns in chronological order with evidence');
    if (new Set(group.map((t) => t.speaker)).size !== 1) throw new ValueError('Correct speaker labels explicitly before joining turns');
    const first = group[0];
    first.text = group.map((t) => t.text).join(' ');
    first.end = group.map((t) => t.end).reduce(max2);
    first.word_ids = group.flatMap((t) => t.word_ids);
    first.source_turn_ids = group.map((t) => t.id);
    first.alias_anchors = [...new Set(group.slice(1).map((t) => t.anchor).filter((anchor) => anchor !== first.anchor))];
    for (const t of group.slice(1)) Object.assign(t, { text: '', word_ids: [], merged_into: first.id });
    log.push({ ...e, turn_id: first.id, kind: 'join' });
  }
  for (const e of get(edits, 'restorations', [])) {
    const t = turn(e.turn_id);
    if (!truthy(get(e, 'evidence')) || !truthy(get(e, 'source_file')) || !truthy(get(e, 'words')))
      throw new ValueError('Restored speech needs a saved recognizer output and timed words');
    let previous = t.end;
    const restored = e.words.map((w: Json, i: number) => {
      if (num(w.start) < num(previous) || num(w.end) < num(w.start)) throw new ValueError('Restored words must follow the passage in time');
      previous = w.end;
      return { ...w, id: `restored-${t.id}-${String(i).padStart(4, '0')}`, text: strip(w.word), track_id: e.track_id, speaker: t.speaker };
    });
    t.text += ' ' + restored.map((w: Json) => w.text).join(' ');
    t.end = restored.at(-1).end;
    t.restored_words = restored;
    t.word_ids.push(...restored.map((w: Json) => w.id));
    log.push({ ...e, kind: 'restoration' });
  }
  for (const e of get(edits, 'corrections', [])) {
    const t = turn(e.turn_id);
    if (!t.text.includes(e.before) || !truthy(get(e, 'evidence'))) throw new ValueError(`Correction lacks matching text/evidence: ${describe(e)}`);
    const old = t.text;
    t.text = replaceFirst(old, e.before, e.after);
    log.push({ ...e, kind: 'recognition', before_turn: old, after_turn: t.text });
  }
  const corrected = clone(result);
  for (const e of get(edits, 'reading', [])) {
    const t = turn(e.turn_id);
    const before: string = t.text;
    if (!truthy(get(e, 'reason'))) throw new ValueError('Reading edits need a reason');
    let after: string;
    if (has(e, 'text')) after = e.text;
    else {
      after = before;
      for (const phrase of e.remove) {
        if (!after.includes(phrase)) throw new ValueError(`Reading deletion not found in ${t.id}: ${JSON.stringify(phrase)}`);
        after = replaceFirst(after, phrase, '');
      }
      after = strip(after.replace(spaces, ' '));
    }
    if (!isSubtractive(before, after)) throw new ValueError(`Reading edition adds or reorders words in ${t.id}`);
    t.text = after;
    if (before === after) continue;
    log.push({ ...e, kind: 'reading', before_turn: before, after_turn: after });
  }
  return [corrected, result, log];
}

export function validateEditorial(editorial: Json, turns: Json[]) {
  const byId = new Map<string, Json>(turns.map((t) => [t.id, t]));
  for (const item of [...get(editorial, 'titles', []), ...get(editorial, 'headings', [])]) {
    const t = byId.get(item.turn_id);
    if (!t) throw new Error(`KeyError: ${item.turn_id}`);
    if (!norm(t.text).join(' ').includes(norm(item.source_quote).join(' '))) throw new ValueError(`Editorial source quote not found: ${describe(item)}`);
    if (item.kind === 'verbatim' && !equal(norm(item.text), norm(item.source_quote))) throw new ValueError(`Verbatim label is inaccurate: ${describe(item)}`);
    if (item.kind !== 'verbatim' && item.kind !== 'near-verbatim') throw new ValueError('Editorial phrase needs an explicit provenance kind');
  }
  for (const sentence of get(editorial, 'description', [])) {
    if (!truthy(get(sentence, 'turn_ids')) || !truthy(get(sentence, 'kind'))) throw new ValueError('Description sentences need passage references and editorial kind');
    for (const id of sentence.turn_ids) if (!byId.has(id)) throw new ValueError(`Description references missing passage ${id}`);
  }
}

const optional = (path: string, fallback: Json) => (existsSync(path) ? read(path) : fallback);

function loadWords(root: string) {
  const m = read(join(root, 'manifest.json'));
  const raw: Record<string, Json> = {};
  for (const t of m.tracks) raw[t.id] = read(join(root, 'raw', `${t.id}.json`));
  const segments = m.mode === 'mixed' ? read(join(root, 'raw', 'diarization.json')).segments : [];
  return { m, raw, segments, words: makeWords(m, raw, segments) };
}

export function assemble(root: string) {
  const manifest = read(join(root, 'manifest.json'));
  for (const t of manifest.tracks)
    if (fileSha(join(root, t.audio)) !== t.sha256) throw new ValueError('Input audio changed; create a new episode version');
  const { m, raw, words } = loadWords(root);
  const rawSha: Record<string, string> = {};
  for (const id of Object.keys(raw)) rawSha[id] = sha256(dumps(raw[id], { sortKeys: true }));
  const snapshot = { raw_sha256: rawSha };
  const snapshotPath = join(root, 'raw-snapshot.json');
  if (existsSync(snapshotPath)) {
    if (!equal(read(snapshotPath), snapshot)) throw new ValueError('Raw transcript changed; create a new episode version');
  } else save(snapshotPath, snapshot);
  const turnsPath = join(root, 'raw-turns.json');
  let turns: Json[];
  if (existsSync(turnsPath)) {
    // Frozen turn IDs and anchors survive every editorial rebuild.
    turns = read(turnsPath);
    const frozen = turns.flatMap((t) => t.word_ids).sort(compareText), current = words.map((w) => w.id).sort(compareText);
    if (!equal(frozen, current)) throw new ValueError('Raw words changed; create a new episode version instead of moving anchors');
  } else {
    turns = makeTurns(words);
    save(turnsPath, turns);
  }
  const edits = optional(join(root, 'edits.json'), {});
  const [corrected, reading, log] = applyEdits(turns, edits);
  preserveReadingAnchors(reading);
  for (const t of corrected) words.push(...get(t, 'restored_words', []));
  for (const e of get(edits, 'restorations', [])) {
    const path = join(root, e.source_file);
    if (!existsSync(path) || !statSync(path).isFile()) throw new ValueError('Missing restoration source file');
    const source = read(path);
    const offset = source.clip_start_seconds;
    const key = (text: string, start: Json, end: Json) => JSON.stringify([text, num(start), num(end)]);
    const sourceWords = new Set(source.result.segments.flatMap((s: Json) => get(s, 'words', []).map((w: Json) =>
      key(strip(w.word), round(add(w.start, offset), 3), round(add(w.end, offset), 3)))));
    if (e.words.some((w: Json) => !sourceWords.has(key(strip(w.word), w.start, w.end))))
      throw new ValueError('Restored speech must match the saved excerpt words and times');
  }
  // Boundaries can move a passage's first or last word while canonical links stay stable.
  const timed = new Map<string, Json>(words.map((w) => [w.id, w]));
  for (const version of [corrected, reading])
    for (const t of version)
      if (t.word_ids.length) {
        t.start = t.word_ids.map((id: string) => timed.get(id).start).reduce(min2);
        t.end = t.word_ids.map((id: string) => timed.get(id).end).reduce(max2);
      }
  const editorial = optional(join(root, 'editorial.json'), {});
  const publication = optional(join(root, 'published.json'), null);
  if (get(editorial, 'mode') === 'existing' && !truthy(publication)) throw new ValueError('Existing-episode review needs a published metadata snapshot');
  validateEditorial(editorial, corrected);
  const issues: Json[] = optional(join(root, 'review-notes.json'), []);
  const canonical = new Set(turns.map((t) => t.id));
  for (const issue of issues) if (!canonical.has(issue.turn_id)) throw new ValueError('Review marker must reference a canonical turn');
  const rawById = new Map<string, Json>(turns.map((t) => [t.id, t])), correctedById = new Map<string, Json>(corrected.map((t) => [t.id, t]));
  const comparisons: Record<string, Json> = {};
  for (const t of reading) {
    const fixedText = correctedById.get(t.id).text;
    comparisons[t.id] = { cleanup: textDiff(fixedText, t.text),
      recognition: textDiff(get(t, 'source_turn_ids', [t.id]).map((id: string) => rawById.get(id).text).join(' '), fixedText) };
  }
  for (const e of get(edits, 'reading', []))
    if (truthy(get(e, 'semantic_review'))) comparisons[e.turn_id].cleanup.review_note = e.semantic_review;
  const reviewRevision = sha256(dumps({ corrected, issues }, { sortKeys: true })).slice(0, 16);
  const count = (version: Json[]) => sum(version.map((t) => BigInt(norm(t.text).length)));
  const data: Json = { manifest: m, state: 'review_draft', words, raw: turns, corrected, publication, comparisons,
    review_revision: reviewRevision, reading, edits: log, editorial, review: issues,
    stats: { words: sum(turns.map((t) => BigInt(t.word_ids.length))), turns: BigInt(turns.length), reading_words: count(reading),
      raw_lexical_words: count(turns), open_review_items: BigInt(issues.filter((x) => get(x, 'state', 'open') === 'open').length) } };
  save(join(root, 'episode.json'), data);
  const headings = new Map<string, string>(get(editorial, 'headings', []).map((h: Json) => [h.turn_id, h.text]));
  for (const [label, version] of [['raw', turns], ['corrected', corrected], ['reading', reading]] as const) {
    const lines = ['# ' + (truthy(publication) ? publication.title : get(editorial, 'working_title', m.episode_id)), '',
      '> Pilot draft. See review-notes.json for unresolved passages.', ''];
    const seen = new Set<string>();
    for (const t of version) {
      if (label === 'reading' && headings.has(t.id)) lines.push('#### ' + headings.get(t.id), '');
      if (!t.text) continue;
      for (const anchor of [t.anchor, ...get(t, 'alias_anchors', []), ...get(t, 'reading_alias_anchors', [])])
        if (!seen.has(anchor)) { lines.push(`<a id="${anchor}"></a>`); seen.add(anchor); }
      lines.push(`[${stamp(t.start)}] **${t.speaker}:** ${t.text}`, '');
    }
    writeFileSync(join(root, `${label}.md`), lines.join('\n'));
  }
  const payload = dumps(data, { ascii: false }).replaceAll('<', '\\u003c');
  writeFileSync(join(root, 'index.html'), readFileSync(join(here, 'review.html'), 'utf8').split('/*__EPISODE__*/').join(payload));
  writeFileSync(join(root, 'editor.html'), readFileSync(join(here, 'editor.html')));
  console.log(dumps(data.stats));
}

const acknowledgments = new Set(['yeah', 'yes', 'okay', 'ok', 'right', 'cool', 'totally', 'sure', 'oh', 'wow', 'nice', 'mhm', 'mm', 'hmm']);

export function speakerHandoffCandidates(turns: Json[]) {
  const candidates: Json[] = [];
  let cluster: Json[] = [];
  const flush = () => {
    if (cluster.length < 3 || cluster.every((t) => norm(t.text).every((w) => acknowledgments.has(w)))) return;
    candidates.push({ kind: 'speaker_handoff', priority: 'listen', start: cluster[0].start, end: cluster.map((t) => t.end).reduce(max2),
      turn_ids: cluster.map((t) => t.id),
      context: cluster.map((t) => ({ turn_id: t.id, anchor: t.anchor, speaker: t.speaker, start: t.start, end: t.end, text: t.text })),
      note: 'Rapid short speaker handoffs may contain sentence fragments or overlap. Listen before changing wording or speakers; this is not evidence of inaudibility.' });
  };
  for (const turn of turns) {
    const length = norm(turn.text).length;
    if (!(length > 0 && length <= 3)) { flush(); cluster = []; continue; }
    const last = cluster.at(-1);
    if (last && (turn.speaker === last.speaker || num(turn.start) - num(last.end) > 1)) { flush(); cluster = []; }
    cluster.push(turn);
  }
  flush();
  return candidates;
}

export function audit(root: string, crosscheckPath?: string) {
  const { m, segments, words } = loadWords(root);
  const candidates: Json[] = [];
  for (const track of m.tracks) {
    const ws = words.filter((w) => w.track_id === track.id);
    for (let i = 0; i + 1 < ws.length; i++) {
      const a = ws[i], b = ws[i + 1];
      if (num(b.start) - num(a.end) > 2) {
        const speech = sum(segments.map((s: Json) => max2(0n, sub(min2(b.start, s.end), max2(a.end, s.start)))));
        candidates.push({ kind: 'gap', start: a.end, end: b.start, track_id: track.id, acoustic_speech_seconds: round(speech, 2),
          priority: num(speech) > 1 ? 'listen' : 'check', note: 'Gap in recognizer words; could be silence or omitted speech.' });
      }
    }
  }
  if (crosscheckPath) {
    if (m.mode !== 'mixed') throw new ValueError('Window cross-check currently supports one mixed recording');
    const alternate = read(crosscheckPath).segments.flatMap((s: Json) => get(s, 'words', []));
    for (let start = 0; start < Math.trunc(num(m.tracks[0].duration)); start += 30) {
      const inside = (w: Json) => start <= num(w.start) && num(w.start) < start + 30;
      const a = words.filter(inside).map((w) => w.text).join(' ');
      const b = alternate.filter(inside).map((w: Json) => w.word).join(' ');
      const similarity = new SequenceMatcher(norm(a), norm(b)).ratio();
      if (similarity < 0.75 && (a || b))
        candidates.push({ kind: 'model_disagreement', start: BigInt(start), end: BigInt(start + 30), similarity: round(similarity, 3), primary: a,
          alternate: b, note: 'Heuristic lexical difference, not calibrated accuracy or evidence of inaudibility.' });
    }
  }
  const turnsPath = join(root, 'raw-turns.json');
  const turns = existsSync(turnsPath) ? read(turnsPath) : makeTurns(words);
  candidates.push(...speakerHandoffCandidates(turns));
  save(join(root, 'audit.json'), { candidates, notes: 'Review candidates only. Do not auto-correct from model agreement.' });
  console.log(`${candidates.length} candidates saved to ${pathText(join(root, 'audit.json'))}`);
}

export function parseArgs(argv: string[], repeated: string[] = [], booleans: string[] = []) {
  const positional: string[] = [];
  const options: Record<string, string | string[] | boolean> = {};
  for (const name of repeated) options[name] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) { positional.push(arg); continue; }
    const [name, inline] = arg.slice(2).split(/=(.*)/s, 2);
    if (booleans.includes(name)) { options[name] = true; continue; }
    const value = inline ?? argv[++i];
    if (value === undefined) throw new Error(`--${name} needs a value`);
    if (repeated.includes(name)) (options[name] as string[]).push(value);
    else options[name] = value;
  }
  return { positional, options };
}

const usage = `Usage: bun scripts/transcript-pipeline/pipeline.ts <command> <episode> [options]
  ingest <episode> --audio FILE | --track NAME=FILE --offset NAME=SECONDS (twice)
  transcribe|diarize|crosscheck <episode> --config runtime.json
  recheck <episode> --config runtime.json --start SECONDS --end SECONDS [--track track-0]
  assemble <episode>
  audit <episode> [--crosscheck raw/crosscheck-track-0.json]`;

export function main(argv: string[]) {
  const [command, ...rest] = argv;
  const { positional, options } = parseArgs(rest, ['track', 'offset']);
  const episode = positional[0];
  if (!command || !episode) { console.error(usage); return 2; }
  const config = (stage: 'transcribe' | 'diarize' | 'crosscheck') => {
    if (typeof options.config !== 'string') throw new Error(`${command} needs --config`);
    return runtime(options.config, stage);
  };
  switch (command) {
    case 'ingest': {
      const audio = options.audio as string | undefined, tracks = options.track as string[];
      if (Boolean(audio) === Boolean(tracks.length)) throw new Error('Choose --audio or --track, not both');
      ingest(episode, audio, tracks, options.offset as string[]);
      break;
    }
    case 'transcribe': transcribe(episode, config('transcribe')); break;
    case 'diarize': diarize(episode, config('diarize')); break;
    case 'crosscheck': crosscheck(episode, config('crosscheck')); break;
    case 'recheck': {
      if (options.start === undefined || options.end === undefined) throw new Error('recheck requires --start and --end on the episode timeline');
      const track = (options.track as string[]).at(-1) ?? 'track-0';
      recheck(episode, config('transcribe'), track, parseFloatArg(options.start as string), parseFloatArg(options.end as string));
      break;
    }
    case 'assemble': assemble(episode); break;
    case 'audit': audit(episode, options.crosscheck as string | undefined); break;
    default: console.error(usage); return 2;
  }
  return 0;
}

if (import.meta.main) {
  try {
    process.exitCode = main(Bun.argv.slice(2));
  } catch (error) {
    console.error(`${(error as Error).constructor.name}: ${(error as Error).message}`);
    process.exitCode = 1;
  }
}
