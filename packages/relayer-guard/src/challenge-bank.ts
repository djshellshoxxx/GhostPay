/**
 * Question bank and answer normalisation for the challenge module. All content is a fixed local
 * table; every choice is drawn from a caller-supplied deterministic generator (never `Math.random`).
 *
 * @security A plain-text question only raises bot cost. It is not a security boundary.
 */

/** Deterministic integer source. */
export interface ChallengeRng {
  /** @returns An integer in `[0, n)`, `n >= 1`. */
  int(n: number): number;
}

/** A generated question and its canonical (already normalised) answer. */
export interface GeneratedQuestion {
  readonly question: string;
  readonly answer: string;
}

/** Difficulty level. */
export type ChallengeDifficulty = 1 | 2 | 3;

/** Longest accepted answer, in UTF-16 code units, before and after normalisation. */
export const MAX_ANSWER_LENGTH = 64;

const ND = /^\p{Nd}$/u;

/** @returns The decimal value of a `\p{Nd}` code point (runs of Nd are multiples of ten long). */
function digitValue(ch: string): number {
  const cp = ch.codePointAt(0) ?? 0;
  let start = cp;
  while (start > 0 && ND.test(String.fromCodePoint(start - 1))) start--;
  return (cp - start) % 10;
}

/**
 * Canonicalises an answer: NFKC, trim, lowercase, whitespace collapsed to single spaces, every
 * Unicode decimal digit mapped to ASCII, and for numeric answers a leading `+` and leading zeros
 * removed.
 *
 * @security Pure and total: never throws. Inputs over {@link MAX_ANSWER_LENGTH} are rejected before
 * any normalisation work, and again afterwards (NFKC can expand).
 * @param s Raw answer.
 * @returns The canonical form, or `null` when the input is not a string or is too long.
 */
export function normalizeAnswer(s: unknown): string | null {
  if (typeof s !== 'string' || s.length > MAX_ANSWER_LENGTH) return null;
  let t = s.normalize('NFKC').trim().toLowerCase().replace(/\s+/gu, ' ');
  t = t.replace(/\p{Nd}/gu, (c) => String(digitValue(c)));
  if (/^\+?[0-9]+$/u.test(t)) {
    t = t.replace(/^\+/u, '').replace(/^0+(?=[0-9])/u, '');
  }
  return t.length > MAX_ANSWER_LENGTH ? null : t;
}

/** Words used by the word/pattern questions: lowercase ASCII, all distinct. */
export const WORDS: readonly string[] = [
  'sun', 'moon', 'star', 'tree', 'rain', 'wind', 'fish', 'bird',
  'river', 'cloud', 'stone', 'light', 'plant', 'grape', 'bread', 'chair',
  'garden', 'planet', 'window', 'bridge', 'candle', 'forest', 'silver', 'rocket',
  'pencil', 'market', 'island', 'button', 'copper', 'spring', 'basket', 'castle',
  'lantern', 'compass', 'blanket', 'journey', 'harvest', 'thunder', 'mirrors', 'balloon',
  'mountain', 'umbrella', 'notebook', 'elephant', 'sandwich', 'treasure', 'painting', 'campfire',
];

const WORDS_BY_LENGTH: ReadonlyMap<number, readonly string[]> = (() => {
  const m = new Map<number, string[]>();
  for (const w of WORDS) {
    const l = m.get(w.length) ?? [];
    l.push(w);
    m.set(w.length, l);
  }
  return m;
})();
const LENGTHS: readonly number[] = [...WORDS_BY_LENGTH.keys()].sort((a, b) => a - b);

function range(rng: ChallengeRng, lo: number, hi: number): number {
  return lo + rng.int(hi - lo + 1);
}

function pick<T>(rng: ChallengeRng, xs: readonly T[]): T {
  return xs[rng.int(xs.length)] as T;
}

/** Picks `k` distinct items by partial Fisher-Yates. */
function pickDistinct<T>(rng: ChallengeRng, xs: readonly T[], k: number): T[] {
  const a = [...xs];
  for (let i = 0; i < k; i++) {
    const j = i + rng.int(a.length - i);
    const t = a[i] as T;
    a[i] = a[j] as T;
    a[j] = t;
  }
  return a.slice(0, k);
}

type Maker = (rng: ChallengeRng, d: ChallengeDifficulty) => GeneratedQuestion;

const add: Maker = (rng, d) => {
  const hi = d === 1 ? 20 : d === 2 ? 99 : 999;
  const a = range(rng, 2, hi);
  const b = range(rng, 2, hi);
  return { question: `What is ${a} + ${b}?`, answer: String(a + b) };
};

const subtract: Maker = (rng, d) => {
  const hi = d === 1 ? 30 : d === 2 ? 99 : 999;
  const a = range(rng, 10, hi);
  const b = range(rng, 1, a);
  return { question: `What is ${a} - ${b}?`, answer: String(a - b) };
};

const multiply: Maker = (rng, d) => {
  const a = range(rng, 2, d === 2 ? 12 : 35);
  const b = range(rng, 2, d === 2 ? 12 : 19);
  return { question: `What is ${a} * ${b}?`, answer: String(a * b) };
};

const mulAdd: Maker = (rng) => {
  const a = range(rng, 3, 15);
  const b = range(rng, 3, 15);
  const c = range(rng, 10, 99);
  return { question: `What is ${a} * ${b} + ${c}?`, answer: String(a * b + c) };
};

const nthLetter: Maker = (rng) => {
  const w = pick(rng, WORDS);
  const n = range(rng, 1, w.length);
  return {
    question: `Counting from 1, which letter is number ${n} of the word "${w}"?`,
    answer: w.charAt(n - 1),
  };
};

const sequence: Maker = (rng, d) => {
  const start = range(rng, 1, 10 * d);
  const step = range(rng, 2, 3 + 2 * d);
  const terms = [0, 1, 2, 3].map((i) => start + i * step);
  return {
    question: `What number comes next: ${terms.join(', ')}, ?`,
    answer: String(start + 4 * step),
  };
};

const doubling: Maker = (rng) => {
  const start = range(rng, 1, 5);
  const terms = [0, 1, 2, 3].map((i) => start * 2 ** i);
  return {
    question: `What number comes next: ${terms.join(', ')}, ?`,
    answer: String(start * 16),
  };
};

const countLetter: Maker = (rng) => {
  const w = pick(rng, WORDS);
  const ch = w.charAt(rng.int(w.length));
  const n = [...w].filter((c) => c === ch).length;
  return {
    question: `How many times does the letter "${ch}" appear in the word "${w}"?`,
    answer: String(n),
  };
};

const reverse: Maker = (rng) => {
  const w = pick(rng, WORDS);
  return { question: `Type the word "${w}" backwards.`, answer: [...w].reverse().join('') };
};

const longest: Maker = (rng) => {
  const ws = pickDistinct(rng, LENGTHS, 3).map((l) => pick(rng, WORDS_BY_LENGTH.get(l) ?? []));
  const longestFirst = rng.int(2) === 0;
  const sorted = [...ws].sort((a, b) => a.length - b.length);
  return {
    question: `Which of these words is the ${longestFirst ? 'longest' : 'shortest'}: ${ws.join(', ')}?`,
    answer: (longestFirst ? sorted[2] : sorted[0]) as string,
  };
};

const alphabetical: Maker = (rng) => {
  const ws = pickDistinct(rng, WORDS, 3);
  const sorted = [...ws].sort();
  const firstOne = rng.int(2) === 0;
  return {
    question: `Which of these words comes ${firstOne ? 'first' : 'last'} in alphabetical order: ${ws.join(', ')}?`,
    answer: (firstOne ? sorted[0] : sorted[2]) as string,
  };
};

const KINDS: ReadonlyArray<{ readonly min: ChallengeDifficulty; readonly make: Maker }> = [
  { min: 1, make: add },
  { min: 1, make: subtract },
  { min: 1, make: nthLetter },
  { min: 1, make: sequence },
  { min: 2, make: multiply },
  { min: 2, make: countLetter },
  { min: 2, make: reverse },
  { min: 3, make: mulAdd },
  { min: 3, make: longest },
  { min: 3, make: alphabetical },
  { min: 3, make: doubling },
];

/**
 * Generates a question deterministically from `rng`. Higher difficulties unlock more question
 * kinds and larger operands. Prompts use ASCII digits only. The answer is already canonical, i.e.
 * `normalizeAnswer(answer) === answer`.
 *
 * @param rng Deterministic source (HMAC-derived in the service).
 * @param difficulty 1..3.
 */
export function generateQuestion(rng: ChallengeRng, difficulty: ChallengeDifficulty): GeneratedQuestion {
  const kinds = KINDS.filter((k) => k.min <= difficulty);
  return pick(rng, kinds).make(rng, difficulty);
}

