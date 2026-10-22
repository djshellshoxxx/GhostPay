import { err, ok, type Result } from './result.js';
import { hasControlOrInvisible, isMixedScript } from './text.js';

/** An asset the parser may output. `symbol` is `[A-Z][A-Z0-9]{1,11}`; aliases are lowercase words. */
export interface AssetSpec {
  readonly symbol: string;
  readonly decimals: number;
  readonly aliases?: readonly string[];
}

/** Options for {@link parseNlAmount}. */
export interface NlAmountOptions {
  /** Allowlist: the only assets that can be produced. */
  readonly assets: readonly AssetSpec[];
  /** BCP-47-ish tag from the static table (e.g. `en`, `de`, `fr`, `de-CH`). Omit for strict ambiguity rejection. */
  readonly locale?: string;
  /** Symbol used when the text names no asset. */
  readonly defaultAsset?: string;
  readonly allowZero?: boolean;
  /** Upper bound in base units (default 2^128 - 1). */
  readonly maxBase?: bigint;
}

/** Successful parse. */
export interface NlAmount {
  /** Base units (integer, exact, no rounding). */
  readonly amount: bigint;
  readonly symbol: string;
  readonly decimals: number;
  /** Canonical decimal string of the same value (no trailing zeros). */
  readonly normalized: string;
  readonly mode: 'digits' | 'words';
  /** How separators were resolved: by the supplied locale, or because the text was unambiguous. */
  readonly separators: 'locale' | 'unambiguous' | 'none';
}

export type NlErrorCode =
  | 'not-string'
  | 'empty'
  | 'too-long'
  | 'invisible-char'
  | 'mixed-script'
  | 'non-ascii'
  | 'negative'
  | 'bad-number'
  | 'bad-grouping'
  | 'ambiguous-separator'
  | 'unsupported-locale'
  | 'unexpected-token'
  | 'missing-asset'
  | 'asset-not-allowed'
  | 'too-many-decimals'
  | 'too-large'
  | 'zero'
  | 'bad-words';

/** Max input length. */
export const MAX_NL_CHARS = 128;
const MAX_DIGITS = 30;
const U128 = (1n << 128n) - 1n;
const SPACES = ' \u00a0\u202f';
const EXTRA_ALLOWED = new Set(['\u00a0', '\u202f', '\u2019']);

interface Seps {
  readonly decimal: string;
  readonly groups: string; // accepted group characters
}
const DOT_COMMA: Seps = { decimal: '.', groups: ',' };
const COMMA_DOT: Seps = { decimal: ',', groups: '.' };
const COMMA_SPACE: Seps = { decimal: ',', groups: SPACES };
const LOCALES: Readonly<Record<string, Seps>> = {
  ...Object.fromEntries(['en', 'ja', 'zh', 'ko', 'he', 'th', 'hi'].map((l) => [l, DOT_COMMA])),
  ...Object.fromEntries(
    ['de', 'es', 'it', 'nl', 'pt', 'id', 'tr', 'da', 'el', 'ro', 'hr'].map((l) => [l, COMMA_DOT]),
  ),
  ...Object.fromEntries(
    ['fr', 'ru', 'pl', 'cs', 'sv', 'nb', 'fi', 'uk', 'hu', 'sk', 'bg'].map((l) => [l, COMMA_SPACE]),
  ),
  'de-ch': { decimal: '.', groups: "'\u2019" },
  'en-us': DOT_COMMA,
  'en-gb': DOT_COMMA,
};

/**
 * Looks up decimal/group separators for a locale from a static table (no `Intl`, so results are deterministic).
 *
 * @returns `null` for unknown or malformed tags.
 */
export function separatorsForLocale(tag: string): { decimal: string; groups: string } | null {
  if (!/^[a-zA-Z]{2,3}(?:[-_][a-zA-Z0-9]{2,8})*$/.test(tag)) return null;
  const t = tag.toLowerCase().replace('_', '-');
  return LOCALES[t] ?? LOCALES[t.split('-')[0] as string] ?? null;
}

const ONES: Readonly<Record<string, number>> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};
const TENS: Readonly<Record<string, number>> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};
const SCALES: Readonly<Record<string, bigint>> = {
  thousand: 1000n,
  million: 1_000_000n,
  billion: 1_000_000_000n,
};
const MULTIPLIERS: Readonly<Record<string, bigint>> = {
  k: 1000n,
  m: 1_000_000n,
  b: 1_000_000_000n,
  ...SCALES,
};
const WORD_SET = new Set([
  ...Object.keys(ONES),
  ...Object.keys(TENS),
  ...Object.keys(SCALES),
  'hundred',
  'and',
  'point',
]);
const RESERVED = new Set([...WORD_SET, ...Object.keys(MULTIPLIERS), 'minus', 'negative']);

function validateAssets(opts: NlAmountOptions): void {
  const seen = new Set<string>();
  for (const a of opts.assets) {
    if (
      !/^[A-Z][A-Z0-9]{1,11}$/.test(a.symbol) ||
      !Number.isInteger(a.decimals) ||
      a.decimals < 0 ||
      a.decimals > 18
    ) {
      throw new TypeError(`invalid asset spec: ${a.symbol}`);
    }
    for (const name of [a.symbol.toLowerCase(), ...(a.aliases ?? [])]) {
      if (!/^[a-z][a-z0-9]{1,15}$/.test(name) || RESERVED.has(name) || seen.has(name)) {
        throw new TypeError(`invalid or duplicate asset name: ${name}`);
      }
      seen.add(name);
    }
  }
  if (opts.defaultAsset !== undefined && !opts.assets.some((a) => a.symbol === opts.defaultAsset)) {
    throw new TypeError('defaultAsset not in allowlist');
  }
}

interface Decimal {
  readonly digits: string; // integer + fraction digits
  readonly scale: number; // fraction digit count
  readonly via: 'locale' | 'unambiguous' | 'none';
}

const INT_RE = /^(0|[1-9][0-9]*)$/;

function fromParts(
  intPart: string,
  frac: string | undefined,
  via: Decimal['via'],
): Result<Decimal, NlErrorCode> {
  let int = intPart;
  if (int.includes('|')) {
    if (!/^[1-9][0-9]{0,2}(?:\|[0-9]{3})+$/.test(int)) return err('bad-grouping');
    int = int.split('|').join('');
  } else if (!INT_RE.test(int)) {
    return err('bad-number');
  }
  if (frac !== undefined && !/^[0-9]+$/.test(frac)) return err('bad-number');
  const f = frac ?? '';
  if (int.length > MAX_DIGITS || f.length > MAX_DIGITS) return err('too-large');
  return ok({ digits: int + f, scale: f.length, via });
}

function parseWithSeps(num: string, seps: Seps): Result<Decimal, NlErrorCode> {
  // Normalise every accepted group character to a single marker char.
  let t = '';
  for (const ch of num) t += seps.groups.includes(ch) ? '|' : ch;
  const parts = t.split(seps.decimal);
  if (parts.length > 2) return err('bad-number');
  return fromParts(parts[0] as string, parts[1], 'locale');
}

function parseUnlocalized(num: string): Result<Decimal, NlErrorCode> {
  const dots = num.split('.').length - 1;
  const commas = num.split(',').length - 1;
  if (dots + commas === 0) return fromParts(num, undefined, 'none');
  if (dots > 0 && commas > 0) {
    const decimal = num.lastIndexOf('.') > num.lastIndexOf(',') ? '.' : ',';
    const group = decimal === '.' ? ',' : '.';
    if (num.split(decimal).length !== 2) return err('bad-number');
    const r = parseWithSeps(num, { decimal, groups: group });
    return r.ok ? ok({ ...r.value, via: 'unambiguous' }) : r;
  }
  const sep = dots > 0 ? '.' : ',';
  const other = sep === '.' ? ',' : '.';
  const [a, b] = num.split(sep) as [string, string | undefined];
  if (dots + commas >= 2) {
    const r = parseWithSeps(num, { decimal: other, groups: sep });
    return r.ok ? ok({ ...r.value, via: 'unambiguous' }) : r;
  }
  if ((b as string).length === 3 && /^[1-9][0-9]{0,2}$/.test(a)) return err('ambiguous-separator');
  return fromParts(a, b, 'unambiguous');
}

function wordInt(tokens: readonly string[]): bigint | null {
  if (tokens.length === 0) return null;
  if (tokens.length === 1 && tokens[0] === 'zero') return 0n;
  let total = 0n;
  let g = 0;
  let slot: 'none' | 'ones' | 'tens' | 'hundred' | 'and' = 'none';
  let lastScale = 10n ** 12n;
  for (const tok of tokens) {
    const one = ONES[tok];
    const ten = TENS[tok];
    const scale = SCALES[tok];
    if (one !== undefined) {
      if (one === 0) return null;
      if (slot === 'tens') {
        if (one > 9) return null;
      } else if (slot !== 'none' && slot !== 'hundred' && slot !== 'and') return null;
      g += one;
      slot = 'ones';
    } else if (ten !== undefined) {
      if (slot !== 'none' && slot !== 'hundred' && slot !== 'and') return null;
      g += ten;
      slot = 'tens';
    } else if (tok === 'hundred') {
      if (slot !== 'ones' || g > 9) return null;
      g *= 100;
      slot = 'hundred';
    } else if (tok === 'and') {
      if (slot !== 'hundred') return null;
      slot = 'and';
    } else if (scale !== undefined) {
      if (g === 0 || slot === 'and' || scale >= lastScale) return null;
      total += BigInt(g) * scale;
      g = 0;
      slot = 'none';
      lastScale = scale;
    } else return null;
  }
  if (slot === 'and' || (g === 0 && total === 0n)) return null;
  return total + BigInt(g);
}

function parseWords(tokens: readonly string[]): Decimal | null {
  const p = tokens.indexOf('point');
  const intTokens = p < 0 ? tokens : tokens.slice(0, p);
  const fracTokens = p < 0 ? [] : tokens.slice(p + 1);
  if (
    p >= 0 &&
    (fracTokens.length === 0 || fracTokens.length > MAX_DIGITS || tokens.indexOf('point', p + 1) >= 0)
  )
    return null;
  const int = wordInt(intTokens);
  if (int === null) return null;
  let frac = '';
  for (const t of fracTokens) {
    const d = ONES[t];
    if (d === undefined || d > 9) return null;
    frac += String(d);
  }
  return { digits: int.toString() + frac, scale: frac.length, via: 'none' };
}

function formatUnits(v: bigint, decimals: number): string {
  const s = v.toString().padStart(decimals + 1, '0');
  const whole = s.slice(0, s.length - decimals);
  const frac = s.slice(s.length - decimals).replace(/0+$/, '');
  return frac === '' ? whole : `${whole}.${frac}`;
}

/**
 * Parses a human amount such as `twenty usdc`, `1,5 eth`, `1.5k`, `1 234,56 eur` into exact base units.
 *
 * @remarks Pipeline: type/length → invisible chars → mixed-script → non-ASCII (only NBSP, narrow NBSP and
 * U+2019 are tolerated, and only as group separators) → negative → number or English number words →
 * optional multiplier (`k`, `m`, `b`, `thousand`, `million`, `billion`) → asset from the allowlist.
 * Strictness: `1,234` and `1.234` are `ambiguous-separator` without a locale; with a locale the locale
 * decides (`en`: 1234, `de`: 1.234). Grouping must be groups of three. No exponent, sign, leading zero,
 * leading/trailing separator, currency symbol, or fractional digit beyond the asset's decimals (no
 * rounding, ever). Result is `bigint`; floating point is never used.
 * @param input Untrusted text (<= 128 chars).
 * @param opts Asset allowlist and optional locale.
 * @throws {TypeError} Only for invalid developer configuration (bad asset specs/default); never for user input.
 * @security A homoglyph (Cyrillic `с` in `usdс`) or mixed-script string is rejected before any asset
 * lookup, so look-alike symbols can never match the allowlist. Output is exact; the UI must still
 * display the parsed asset and amount back to the user for confirmation.
 */
export function parseNlAmount(input: unknown, opts: NlAmountOptions): Result<NlAmount, NlErrorCode> {
  validateAssets(opts);
  if (typeof input !== 'string') return err('not-string');
  if (input.length > MAX_NL_CHARS) return err('too-long');
  const text = input.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '');
  if (text === '') return err('empty');
  if (hasControlOrInvisible(text)) return err('invisible-char');
  if (isMixedScript(text)) return err('mixed-script');
  for (const ch of text) if (ch > '~' && !EXTRA_ALLOWED.has(ch)) return err('non-ascii');

  let seps: Seps | null = null;
  if (opts.locale !== undefined) {
    seps = separatorsForLocale(opts.locale);
    if (seps === null) return err('unsupported-locale');
  }
  const lower = text.toLowerCase();
  if (/^[-(]/.test(text) || /^(minus|negative)\b/.test(lower)) return err('negative');

  let dec: Decimal;
  let mult = 1n;
  let rest: string[];
  let mode: 'digits' | 'words';
  if (/^[0-9]/.test(text)) {
    mode = 'digits';
    const cls = seps === null ? '.,' : `${seps.decimal}${seps.groups}`;
    const esc = cls.replace(/[\\\]^-]/g, '\\$&');
    const m = new RegExp(`^[0-9](?:[0-9${esc}]*[0-9])?`).exec(text) as RegExpExecArray;
    const num = m[0];
    const after = text.slice(num.length);
    const r = seps === null ? parseUnlocalized(num) : parseWithSeps(num, seps);
    if (!r.ok) return r;
    dec = r.value;
    const attached = after !== '' && !SPACES.includes(after[0] as string);
    rest = after.split(/[ \u00a0\u202f]+/).filter((x) => x !== '');
    const first = rest[0]?.toLowerCase();
    if (attached) {
      if (first === undefined || first.length !== 1 || !'kmb'.includes(first)) return err('unexpected-token');
      mult = MULTIPLIERS[first] as bigint;
      rest = rest.slice(1);
    } else if (first !== undefined && Object.hasOwn(MULTIPLIERS, first)) {
      mult = MULTIPLIERS[first] as bigint;
      rest = rest.slice(1);
    }
  } else if (/^[a-z]/.test(lower)) {
    mode = 'words';
    const toks = lower.split(/[ \u00a0\u202f-]+/).filter((x) => x !== '');
    let n = 0;
    while (n < toks.length && WORD_SET.has(toks[n] as string)) n++;
    const w = parseWords(toks.slice(0, n));
    if (w === null) return err('bad-words');
    dec = w;
    rest = toks.slice(n);
  } else {
    return err('bad-number');
  }

  if (rest.length > 1) return err('unexpected-token');
  let asset: AssetSpec | undefined;
  const tok = rest[0]?.toLowerCase();
  if (tok === undefined) {
    if (opts.defaultAsset === undefined) return err('missing-asset');
    asset = opts.assets.find((a) => a.symbol === opts.defaultAsset);
  } else {
    if (!/^[a-z][a-z0-9]{1,15}$/.test(tok)) return err('unexpected-token');
    asset = opts.assets.find((a) => a.symbol.toLowerCase() === tok || a.aliases?.includes(tok) === true);
    if (asset === undefined) return err('asset-not-allowed');
  }
  const a = asset as AssetSpec;
  const scaled = BigInt(dec.digits) * mult * 10n ** BigInt(a.decimals);
  const div = 10n ** BigInt(dec.scale);
  if (scaled % div !== 0n) return err('too-many-decimals');
  const amount = scaled / div;
  if (amount === 0n && opts.allowZero !== true) return err('zero');
  if (amount > (opts.maxBase ?? U128)) return err('too-large');
  return ok({
    amount,
    symbol: a.symbol,
    decimals: a.decimals,
    normalized: formatUnits(amount, a.decimals),
    mode,
    separators: dec.via,
  });
}
