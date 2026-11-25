// Pilot files were written by Python. These helpers reproduce Python's JSON,
// number formatting, text and difflib semantics so rebuilt outputs stay byte-identical.
// Python ints parse to bigint and floats to number, so `1` and `1.0` survive a round trip.

export type Json = any;

export class ValueError extends Error {}

// JS lists integer-like keys first; Python keeps insertion order. Parsed objects remember theirs.
const keyOrder = Symbol('keyOrder');

export function keys(object: Record<string, Json>): string[] {
  const own = Object.keys(object);
  const order: string[] | undefined = (object as any)[keyOrder];
  if (!order) return own;
  const present = new Set(own);
  const kept = order.filter((k) => present.has(k));
  const seen = new Set(kept);
  return [...kept, ...own.filter((k) => !seen.has(k))];
}

export function loads(text: string): Json {
  let i = 0;
  const fail = (what: string): never => { throw new ValueError(`Invalid JSON (${what}) at ${i}`); };
  const space = () => { while (i < text.length && ' \t\n\r'.includes(text[i])) i++; };
  const value = (): Json => {
    space();
    const c = text[i];
    if (c === '{') {
      i++;
      const object: Record<string, Json> = {};
      const order: string[] = [];
      space();
      if (text[i] === '}') { i++; return object; }
      for (;;) {
        space();
        if (text[i] !== '"') fail('key');
        const key = string();
        space();
        if (text[i++] !== ':') fail('colon');
        if (!(key in object)) order.push(key);
        object[key] = value();
        space();
        if (text[i] === ',') { i++; continue; }
        if (text[i++] !== '}') fail('object');
        if (Object.keys(object).some((k, n) => k !== order[n])) (object as any)[keyOrder] = order;
        return object;
      }
    }
    if (c === '[') {
      i++;
      const list: Json[] = [];
      space();
      if (text[i] === ']') { i++; return list; }
      for (;;) {
        list.push(value());
        space();
        if (text[i] === ',') { i++; continue; }
        if (text[i++] !== ']') fail('array');
        return list;
      }
    }
    if (c === '"') return string();
    for (const [word, result] of [['null', null], ['true', true], ['false', false], ['NaN', NaN], ['Infinity', Infinity], ['-Infinity', -Infinity]] as const) {
      if (text.startsWith(word, i)) { i += word.length; return result; }
    }
    const match = /-?(?:0|[1-9]\d*)(\.\d+)?([eE][-+]?\d+)?/y;
    match.lastIndex = i;
    const number = match.exec(text) ?? fail('value');
    i = match.lastIndex;
    return number[1] || number[2] ? Number(number[0]) : BigInt(number[0]);
  };
  const string = (): string => {
    i++;
    let out = '';
    for (;;) {
      const start = i;
      while (i < text.length && text[i] !== '"' && text[i] !== '\\') {
        if (text.charCodeAt(i) < 0x20) fail('control character');
        i++;
      }
      out += text.slice(start, i);
      if (i >= text.length) fail('unterminated string');
      if (text[i++] === '"') return out;
      const e = text[i++];
      const simple: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
      if (e in simple) out += simple[e];
      else if (e === 'u' && /^[0-9a-fA-F]{4}$/.test(text.slice(i, i + 4))) { out += String.fromCharCode(parseInt(text.slice(i, i + 4), 16)); i += 4; }
      else fail('escape');
    }
  };
  const result = value();
  space();
  if (i !== text.length) fail('trailing data');
  return result;
}

const hex4 = (code: number) => '\\u' + code.toString(16).padStart(4, '0');
const shortEscapes: Record<string, string> = { '\\': '\\\\', '"': '\\"', '\b': '\\b', '\f': '\\f', '\n': '\\n', '\r': '\\r', '\t': '\\t' };

function quote(text: string, ascii: boolean) {
  const pattern = ascii ? /[\\"]|[^ -~]/g : /[\x00-\x1f\\"]/g;
  return '"' + text.replace(pattern, (c) => shortEscapes[c] ?? hex4(c.charCodeAt(0))) + '"';
}

export function floatRepr(x: number): string {
  if (Number.isNaN(x)) return 'NaN';
  if (x === Infinity) return 'Infinity';
  if (x === -Infinity) return '-Infinity';
  if (x === 0) return Object.is(x, -0) ? '-0.0' : '0.0';
  const [mantissa, exponentText] = Math.abs(x).toExponential().split('e');
  const digits = mantissa.replace('.', '');
  const exponent = Number(exponentText);
  const sign = x < 0 ? '-' : '';
  if (exponent < -4 || exponent >= 16) {
    const body = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits;
    return `${sign}${body}e${exponent < 0 ? '-' : '+'}${String(Math.abs(exponent)).padStart(2, '0')}`;
  }
  if (exponent < 0) return `${sign}0.${'0'.repeat(-exponent - 1)}${digits}`;
  const whole = digits.slice(0, exponent + 1).padEnd(exponent + 1, '0');
  return `${sign}${whole}.${digits.slice(exponent + 1) || '0'}`;
}

type DumpOptions = { indent?: number; ascii?: boolean; sortKeys?: boolean };

export function dumps(value: Json, { indent, ascii = true, sortKeys = false }: DumpOptions = {}): string {
  const write = (v: Json, depth: number): string => {
    if (v === null) return 'null';
    if (v === true) return 'true';
    if (v === false) return 'false';
    if (typeof v === 'bigint') return v.toString();
    if (typeof v === 'number') return floatRepr(v);
    if (typeof v === 'string') return quote(v, ascii);
    const entries: string[] = Array.isArray(v)
      ? v.map((item) => write(item, depth + 1))
      : (sortKeys ? Object.keys(v).sort() : keys(v)).map((key) => {
          if (v[key] === undefined) throw new TypeError(`Undefined JSON value for ${key}`);
          return quote(key, ascii) + ': ' + write(v[key], depth + 1);
        });
    const [open, close] = Array.isArray(v) ? ['[', ']'] : ['{', '}'];
    if (!entries.length) return open + close;
    if (indent === undefined) return open + entries.join(', ') + close;
    const inner = '\n' + ' '.repeat(indent * (depth + 1));
    return open + inner + entries.join(',' + inner) + '\n' + ' '.repeat(indent * depth) + close;
  };
  return write(value, 0);
}

// Exact decimal value of a double, as integer N and scale k (value = N / 10^k).
function exact(x: number): [bigint, number] {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, Math.abs(x));
  const bits = view.getBigUint64(0);
  const biased = Number(bits >> 52n);
  let mantissa = bits & ((1n << 52n) - 1n);
  if (biased) mantissa |= 1n << 52n;
  const power = (biased || 1) - 1075;
  return power >= 0 ? [mantissa << BigInt(power), 0] : [mantissa * 5n ** BigInt(-power), -power];
}

function roundHalfEven(n: bigint, drop: number): bigint {
  if (drop <= 0) return n * 10n ** BigInt(-drop);
  const unit = 10n ** BigInt(drop);
  const q = n / unit, r = n % unit, twice = 2n * r;
  return twice > unit || (twice === unit && q % 2n === 1n) ? q + 1n : q;
}

function fixedDigits(x: number, places: number): string {
  const [n, scale] = exact(x);
  const digits = roundHalfEven(n, scale - places).toString().padStart(places + 1, '0');
  const sign = x < 0 || Object.is(x, -0) ? '-' : '';
  return sign + (places ? `${digits.slice(0, -places)}.${digits.slice(-places)}` : digits);
}

export const fixed = (x: Json, places: number) =>
  typeof x === 'bigint' ? `${x}${places ? '.' + '0'.repeat(places) : ''}` : fixedDigits(x, places);

export function round(x: Json, places: number): Json {
  if (typeof x === 'bigint') return x;
  if (!Number.isFinite(x)) return x;
  return Number(fixedDigits(x, places));
}

// format(x, 'g'): six significant digits, trailing zeros removed.
export function g(value: Json): string {
  const x = Number(value);
  if (!Number.isFinite(x)) return Number.isNaN(x) ? 'nan' : x > 0 ? 'inf' : '-inf';
  if (x === 0) return Object.is(x, -0) ? '-0' : '0';
  const [n, scale] = exact(x);
  const length = n.toString().length;
  let rounded = roundHalfEven(n, length - 6);
  let exponent = length - 1 - scale;
  if (rounded.toString().length > 6) { rounded /= 10n; exponent += 1; }
  const digits = rounded.toString();
  const sign = x < 0 ? '-' : '';
  const trim = (s: string) => s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
  if (exponent < -4 || exponent >= 6) {
    const body = trim(`${digits[0]}.${digits.slice(1)}`);
    return `${sign}${body}e${exponent < 0 ? '-' : '+'}${String(Math.abs(exponent)).padStart(2, '0')}`;
  }
  if (exponent < 0) return sign + trim(`0.${'0'.repeat(-exponent - 1)}${digits}`);
  return sign + trim(`${digits.slice(0, exponent + 1)}.${digits.slice(exponent + 1)}`);
}

export const pySpace = '\\t\\n\\v\\f\\r\\x1c-\\x20\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000';
export const spaces = new RegExp(`[${pySpace}]+`, 'gu');
export const strip = (text: string) => text.replace(new RegExp(`^[${pySpace}]+|[${pySpace}]+$`, 'gu'), '');
export const rstrip = (text: string) => text.replace(new RegExp(`[${pySpace}]+$`, 'u'), '');

export const wordPattern = () => /[\p{L}\p{N}_]+(?:['’][\p{L}\p{N}_]+)*/gu;
export const norm = (text: string) => text.toLowerCase().replaceAll('’', "'").match(wordPattern()) ?? [];

export const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' })[c]!);

export function parseFloatArg(text: string): number {
  const t = strip(text);
  if (/^[+-]?(?:inf(?:inity)?|nan)$/i.test(t)) return Number(t.replace(/^([+-]?)inf(inity)?$/i, '$1Infinity').replace(/nan/i, 'NaN'));
  if (!/^[+-]?(?:\d(?:_?\d)*(?:\.(?:\d(?:_?\d)*)?)?|\.\d(?:_?\d)*)(?:[eE][+-]?\d(?:_?\d)*)?$/.test(t)) throw new ValueError(`could not convert string to float: '${text}'`);
  return Number(t.replaceAll('_', ''));
}

// str(Path(text)) for relative and absolute POSIX paths.
export function pathText(text: string): string {
  const absolute = text.startsWith('/');
  const parts = text.split('/').filter((part) => part && part !== '.');
  const joined = parts.join('/');
  if (absolute) return (text.startsWith('//') && !text.startsWith('///') ? '//' : '/') + joined;
  return joined || '.';
}

export const pyMin = <T>(items: T[], key: (item: T) => Json = (x) => x): T =>
  items.reduce((best, item) => (key(item) < key(best) ? item : best));
export const pyMax = <T>(items: T[], key: (item: T) => Json = (x) => x): T =>
  items.reduce((best, item) => (key(item) > key(best) ? item : best));

// difflib.SequenceMatcher(None, a, b, autojunk=False)
export class SequenceMatcher {
  private b2j = new Map<string, number[]>();
  private blocks: [number, number, number][] | null = null;

  constructor(private a: string[], private b: string[]) {
    b.forEach((element, index) => {
      const indices = this.b2j.get(element);
      if (indices) indices.push(index);
      else this.b2j.set(element, [index]);
    });
  }

  private longest(alo: number, ahi: number, blo: number, bhi: number): [number, number, number] {
    const { a, b } = this;
    let besti = alo, bestj = blo, bestsize = 0;
    let j2len = new Map<number, number>();
    for (let i = alo; i < ahi; i++) {
      const next = new Map<number, number>();
      for (const j of this.b2j.get(a[i]) ?? []) {
        if (j < blo) continue;
        if (j >= bhi) break;
        const k = (j2len.get(j - 1) ?? 0) + 1;
        next.set(j, k);
        if (k > bestsize) { besti = i - k + 1; bestj = j - k + 1; bestsize = k; }
      }
      j2len = next;
    }
    while (besti > alo && bestj > blo && a[besti - 1] === b[bestj - 1]) { besti--; bestj--; bestsize++; }
    while (besti + bestsize < ahi && bestj + bestsize < bhi && a[besti + bestsize] === b[bestj + bestsize]) bestsize++;
    return [besti, bestj, bestsize];
  }

  matchingBlocks(): [number, number, number][] {
    if (this.blocks) return this.blocks;
    const la = this.a.length, lb = this.b.length;
    const queue: [number, number, number, number][] = [[0, la, 0, lb]];
    const found: [number, number, number][] = [];
    while (queue.length) {
      const [alo, ahi, blo, bhi] = queue.pop()!;
      const match = this.longest(alo, ahi, blo, bhi);
      const [i, j, k] = match;
      if (k) {
        found.push(match);
        if (alo < i && blo < j) queue.push([alo, i, blo, j]);
        if (i + k < ahi && j + k < bhi) queue.push([i + k, ahi, j + k, bhi]);
      }
    }
    found.sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]);
    let i1 = 0, j1 = 0, k1 = 0;
    const blocks: [number, number, number][] = [];
    for (const [i2, j2, k2] of found) {
      if (i1 + k1 === i2 && j1 + k1 === j2) k1 += k2;
      else {
        if (k1) blocks.push([i1, j1, k1]);
        [i1, j1, k1] = [i2, j2, k2];
      }
    }
    if (k1) blocks.push([i1, j1, k1]);
    blocks.push([la, lb, 0]);
    return (this.blocks = blocks);
  }

  opcodes(): [string, number, number, number, number][] {
    let i = 0, j = 0;
    const answer: [string, number, number, number, number][] = [];
    for (const [ai, bj, size] of this.matchingBlocks()) {
      const tag = i < ai && j < bj ? 'replace' : i < ai ? 'delete' : j < bj ? 'insert' : '';
      if (tag) answer.push([tag, i, ai, j, bj]);
      i = ai + size; j = bj + size;
      if (size) answer.push(['equal', ai, i, bj, j]);
    }
    return answer;
  }

  ratio(): number {
    const matches = this.matchingBlocks().reduce((sum, block) => sum + block[2], 0);
    const length = this.a.length + this.b.length;
    return length ? (2.0 * matches) / length : 1.0;
  }
}

// Python arithmetic on parsed numbers: int op int stays int, anything else is a float.
export const num = (x: Json): number => Number(x);
export const add = (a: Json, b: Json): Json => typeof a === 'bigint' && typeof b === 'bigint' ? a + b : Number(a) + Number(b);
export const sub = (a: Json, b: Json): Json => typeof a === 'bigint' && typeof b === 'bigint' ? a - b : Number(a) - Number(b);
export const max2 = (a: Json, b: Json): Json => (Number(b) > Number(a) ? b : a);
export const min2 = (a: Json, b: Json): Json => (Number(b) < Number(a) ? b : a);
export const sum = (items: Json[]): Json => items.reduce(add, 0n);
export const int = (n: number | bigint) => BigInt(n);

export const compareText = (a: string, b: string) => {
  const x = Array.from(a), y = Array.from(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = x[i].codePointAt(0)! - y[i].codePointAt(0)!;
    if (d) return d;
  }
  return x.length - y.length;
};

export function equal(a: Json, b: Json): boolean {
  const numeric = (x: Json) => typeof x === 'number' || typeof x === 'bigint';
  if (numeric(a) && numeric(b)) return Number(a) === Number(b) && (typeof a !== 'bigint' || typeof b !== 'bigint' || a === b);
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => equal(x, b[i]));
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => k in b && equal(a[k], b[k]));
  }
  return a === b;
}

export function clone<T>(value: T): T {
  if (Array.isArray(value)) return value.map(clone) as T;
  if (value && typeof value === 'object') {
    const copy: any = {};
    for (const key of Object.keys(value)) copy[key] = clone((value as any)[key]);
    const order = (value as any)[keyOrder];
    if (order) copy[keyOrder] = [...order];
    return copy;
  }
  return value;
}

export const has = (object: Json, key: string) => Object.prototype.hasOwnProperty.call(object, key);
export const get = (object: Json, key: string, fallback: Json = undefined) => (has(object, key) ? object[key] : fallback);
export const truthy = (x: Json) => Array.isArray(x) ? x.length > 0 : x && typeof x === 'object' ? Object.keys(x).length > 0 : Boolean(x) && x !== 0n;
