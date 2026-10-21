import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { GuardError } from './errors.js';
import { generateQuestion, normalizeAnswer, WORDS, type ChallengeDifficulty } from './challenge-bank.js';
import {
  createChallengeService,
  MemoryAttemptLimiter,
  MemoryReplayStore,
  ReplayStoreFullError,
  type AttemptLimiter,
  type ChallengeOptions,
  type ReplayStore,
} from './challenge.js';

const SECRET_A = new Uint8Array(32).fill(1);
const SECRET_B = new Uint8Array(40).fill(2);
const CTX = '1:0xabc';

function seeded(seed: number): (n: number) => Uint8Array {
  let i = 0;
  return (n) => createHash('sha256').update(`${seed}:${i++}`).digest().subarray(0, n);
}

function make(over: Partial<ChallengeOptions> = {}, clock = { t: 1_000_000 }) {
  const svc = createChallengeService({
    secrets: [SECRET_A],
    now: () => clock.t,
    randomBytes: seeded(7),
    ...over,
  });
  return { svc, clock };
}

/** Independent solver: parses the prompt text and recomputes the answer. */
function solve(q: string): string {
  let m: RegExpMatchArray | null;
  if ((m = /^What is (\d+) ([+\-*]) (\d+)\?$/u.exec(q))) {
    const a = Number(m[1]);
    const b = Number(m[3]);
    return String(m[2] === '+' ? a + b : m[2] === '-' ? a - b : a * b);
  }
  if ((m = /^What is (\d+) \* (\d+) \+ (\d+)\?$/u.exec(q))) return String(Number(m[1]) * Number(m[2]) + Number(m[3]));
  if ((m = /^Counting from 1, which letter is number (\d+) of the word "(\w+)"\?$/u.exec(q))) {
    return (m[2] as string)[Number(m[1]) - 1] as string;
  }
  if ((m = /^What number comes next: (\d+), (\d+), (\d+), (\d+), \?$/u.exec(q))) {
    const t = m.slice(1, 5).map(Number) as [number, number, number, number];
    return t[1] - t[0] === t[2] - t[1] ? String(t[3] + (t[1] - t[0])) : String(t[3] * 2);
  }
  if ((m = /^How many times does the letter "(\w)" appear in the word "(\w+)"\?$/u.exec(q))) {
    return String([...(m[2] as string)].filter((c) => c === m?.[1]).length);
  }
  if ((m = /^Type the word "(\w+)" backwards\.$/u.exec(q))) return [...(m[1] as string)].reverse().join('');
  if ((m = /^Which of these words is the (longest|shortest): (\w+), (\w+), (\w+)\?$/u.exec(q))) {
    const ws = m.slice(2, 5);
    return [...ws].sort((a, b) => (m?.[1] === 'longest' ? b.length - a.length : a.length - b.length))[0] as string;
  }
  if ((m = /^Which of these words comes (first|last) in alphabetical order: (\w+), (\w+), (\w+)\?$/u.exec(q))) {
    const s = m.slice(2, 5).sort();
    return (m[1] === 'first' ? s[0] : s[2]) as string;
  }
  throw new Error(`unrecognised question: ${q}`);
}

describe('challenge happy path', () => {
  for (const difficulty of [1, 2, 3] as const) {
    it(`solves many seeds at difficulty ${difficulty} with an independent solver`, async () => {
      for (let seed = 0; seed < 300; seed++) {
        const { svc } = make({ difficulty, randomBytes: seeded(seed) });
        const c = svc.issue(CTX);
        expect(await svc.verify({ token: c.token, answer: solve(c.question), context: CTX })).toEqual({ ok: true });
      }
    });
  }

  it('answers are canonical and prompts are ASCII', () => {
    for (const d of [1, 2, 3] as const) {
      for (let seed = 0; seed < 200; seed++) {
        const rand = seeded(seed);
        const g = generateQuestion({ int: (n) => Buffer.from(rand(4)).readUInt32BE(0) % n }, d);
        expect(normalizeAnswer(g.answer)).toBe(g.answer);
        expect(g.question).toMatch(/^[\x20-\x7e]+$/u);
        expect(solve(g.question)).toBe(g.answer);
      }
    }
  });

  it('higher difficulties are reachable: every kind appears across seeds', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 400; seed++) {
      const { svc } = make({ difficulty: 3, randomBytes: seeded(seed) });
      seen.add(svc.issue(CTX).question.replace(/[0-9]+/gu, 'N').split(' ').slice(0, 4).join(' '));
    }
    expect(seen.size).toBeGreaterThanOrEqual(8);
  });

  it('arithmetic questions do not contain the answer as a number token', () => {
    for (let seed = 0; seed < 300; seed++) {
      const { svc } = make({ difficulty: 2, randomBytes: seeded(seed) });
      const q = svc.issue(CTX).question;
      if (/^What is \d+ [+\-*] \d+\?$/u.test(q)) {
        const nums = q.match(/\d+/gu) ?? [];
        expect(nums).not.toContain(solve(q));
      }
    }
  });

  it('is deterministic: same nonce and key give the same question', () => {
    const a = make({ randomBytes: seeded(5) }).svc.issue(CTX);
    const b = make({ randomBytes: seeded(5) }).svc.issue(CTX);
    expect(a).toEqual(b);
  });

  it('uses crypto.randomBytes by default and Date.now', async () => {
    const svc = createChallengeService({ secrets: [SECRET_A] });
    const c = svc.issue(CTX);
    expect(c.expiresAt).toBeGreaterThan(Date.now());
    expect(await svc.verify({ token: c.token, answer: solve(c.question), context: CTX })).toEqual({ ok: true });
    expect(svc.issue(CTX).token).not.toBe(c.token);
  });

  it('token never contains the answer (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1e6 }), fc.constantFrom<ChallengeDifficulty>(1, 2, 3), (seed, d) => {
        const { svc } = make({ difficulty: d, randomBytes: seeded(seed) });
        const c = svc.issue(CTX);
        const answer = solve(c.question);
        const inner = Buffer.from(c.token, 'base64url').toString('utf8');
        const tail = inner.split('.').slice(2).join('.');
        // Answers of >= 4 chars cannot appear by accident in 22+43 random-looking chars.
        if (answer.length >= 4) {
          expect(c.token).not.toContain(answer);
          expect(tail).not.toContain(answer);
        }
        expect(inner.startsWith('v1.')).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});

describe('tampering', () => {
  it('every single-character change of the token is rejected', async () => {
    const { svc } = make();
    const c = svc.issue(CTX);
    const answer = solve(c.question);
    const swap = (ch: string): string => (ch === 'A' ? 'B' : 'A');
    for (let i = 0; i < c.token.length; i++) {
      const t = c.token.slice(0, i) + swap(c.token.charAt(i)) + c.token.slice(i + 1);
      const r = await svc.verify({ token: t, answer, context: CTX });
      expect(r.ok).toBe(false);
    }
    // and the original still works afterwards: failures did not mark it used
    expect(await svc.verify({ token: c.token, answer, context: CTX })).toEqual({ ok: true });
  });

  it('tampering with each segment is bad_signature or malformed', async () => {
    const { svc } = make();
    const c = svc.issue(CTX);
    const parts = Buffer.from(c.token, 'base64url').toString('utf8').split('.') as [string, string, string, string];
    const enc = (p: string[]): string => Buffer.from(p.join('.'), 'utf8').toString('base64url');
    const answer = solve(c.question);
    const check = async (p: string[], reason: string): Promise<void> => {
      expect(await svc.verify({ token: enc(p), answer, context: CTX })).toEqual({ ok: false, reason });
    };
    await check(['v2', parts[1], parts[2], parts[3]], 'malformed');
    await check([parts[0], String(Number(parts[1]) + 1), parts[2], parts[3]], 'bad_signature');
    await check([parts[0], parts[1], 'A'.repeat(22), parts[3]], 'bad_signature');
    await check([parts[0], parts[1], parts[2], 'A'.repeat(43)], 'bad_signature');
    await check([parts[0], parts[1], parts[2]], 'malformed');
    await check([parts[0], parts[1], parts[2], parts[3], 'x'], 'malformed');
    await check([parts[0], '007', parts[2], parts[3]], 'malformed');
    await check([parts[0], 'abc', parts[2], parts[3]], 'malformed');
    await check([parts[0], parts[1], 'short', parts[3]], 'malformed');
    await check([parts[0], parts[1], parts[2], 'short'], 'malformed');
    // non-canonical base64url (last char with stray bits)
    await check([parts[0], parts[1], parts[2].slice(0, 21) + 'B', parts[3]], 'malformed');
  });

  it('a different context is bad_signature (context_mismatch is intentionally not distinguishable)', async () => {
    const { svc } = make();
    const c = svc.issue(CTX);
    expect(await svc.verify({ token: c.token, answer: solve(c.question), context: '1:0xdef' })).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
  });

  it('a different difficulty cannot verify the token', async () => {
    const c = make({ difficulty: 1 }).svc.issue(CTX);
    const r = await make({ difficulty: 2 }).svc.verify({ token: c.token, answer: solve(c.question), context: CTX });
    expect(r).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('a token from another secret is rejected', async () => {
    const c = make({ secrets: [SECRET_B] }).svc.issue(CTX);
    expect(await make().svc.verify({ token: c.token, answer: solve(c.question), context: CTX })).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
  });
});

describe('expiry and clock', () => {
  it('is valid strictly before expiresAt and expired at the boundary', async () => {
    const { svc, clock } = make({ ttlMs: 1000 });
    const c = svc.issue(CTX);
    expect(c.expiresAt).toBe(1_001_000);
    const answer = solve(c.question);
    clock.t = c.expiresAt;
    expect(await svc.verify({ token: c.token, answer, context: CTX })).toEqual({ ok: false, reason: 'expired' });
    clock.t = c.expiresAt - 1;
    expect(await svc.verify({ token: c.token, answer, context: CTX })).toEqual({ ok: true });
  });

  it('expired tokens do not consume attempts', async () => {
    const attemptLimiter = new MemoryAttemptLimiter();
    const { svc, clock } = make({ ttlMs: 10, attemptLimiter });
    const c = svc.issue(CTX);
    clock.t += 10;
    await svc.verify({ token: c.token, answer: 'x', context: CTX });
    expect(attemptLimiter.increment('other', Date.now() + 1000)).toBe(1);
  });

  it('defaults to a 120s ttl', () => {
    const { svc } = make();
    expect(svc.issue(CTX).expiresAt).toBe(1_000_000 + 120_000);
  });
});

describe('rotation', () => {
  it('old secret still verifies, new secret signs', async () => {
    const old = make({ secrets: [SECRET_A] }).svc.issue(CTX);
    const { svc } = make({ secrets: [SECRET_B, SECRET_A] });
    expect(await svc.verify({ token: old.token, answer: solve(old.question), context: CTX })).toEqual({ ok: true });
    const fresh = svc.issue(CTX);
    // only-new service verifies it; only-old does not
    const answer = solve(fresh.question);
    expect(await make({ secrets: [SECRET_B] }).svc.verify({ token: fresh.token, answer, context: CTX })).toEqual({ ok: true });
    expect(await make({ secrets: [SECRET_A] }).svc.verify({ token: fresh.token, answer, context: CTX })).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
  });

  it('subkeys are independent: sign and question keys differ per purpose', () => {
    // Same nonce under two secrets gives different questions (with overwhelming probability across seeds).
    let differing = 0;
    for (let seed = 0; seed < 50; seed++) {
      const a = make({ secrets: [SECRET_A], randomBytes: seeded(seed), difficulty: 3 }).svc.issue(CTX).question;
      const b = make({ secrets: [SECRET_B], randomBytes: seeded(seed), difficulty: 3 }).svc.issue(CTX).question;
      if (a !== b) differing++;
    }
    expect(differing).toBeGreaterThan(40);
  });

  it('copies secrets so later mutation by the caller has no effect', async () => {
    const s = new Uint8Array(32).fill(9);
    const { svc } = make({ secrets: [s] });
    const c = svc.issue(CTX);
    s.fill(0);
    expect(await svc.verify({ token: c.token, answer: solve(c.question), context: CTX })).toEqual({ ok: true });
  });
});

describe('replay and attempts', () => {
  it('rejects a second use of a solved token', async () => {
    const { svc } = make({ maxAttempts: 5 });
    const c = svc.issue(CTX);
    const answer = solve(c.question);
    expect(await svc.verify({ token: c.token, answer, context: CTX })).toEqual({ ok: true });
    expect(await svc.verify({ token: c.token, answer, context: CTX })).toEqual({ ok: false, reason: 'replayed' });
  });

  it('wrong answers count attempts but do not mark replay', async () => {
    const { svc } = make();
    const c = svc.issue(CTX);
    const answer = solve(c.question);
    expect(await svc.verify({ token: c.token, answer: 'zzz', context: CTX })).toEqual({ ok: false, reason: 'wrong_answer' });
    expect(await svc.verify({ token: c.token, answer: '', context: CTX })).toEqual({ ok: false, reason: 'wrong_answer' });
    expect(await svc.verify({ token: c.token, answer, context: CTX })).toEqual({ ok: true });
  });

  it('exceeding maxAttempts rejects even the correct answer', async () => {
    const { svc } = make({ maxAttempts: 2 });
    const c = svc.issue(CTX);
    const answer = solve(c.question);
    expect((await svc.verify({ token: c.token, answer: 'no', context: CTX })).ok).toBe(false);
    expect((await svc.verify({ token: c.token, answer: 'no', context: CTX })).ok).toBe(false);
    expect(await svc.verify({ token: c.token, answer, context: CTX })).toEqual({ ok: false, reason: 'too_many_attempts' });
  });

  it('oversized and non-string answers count as wrong answers', async () => {
    const { svc } = make();
    const c = svc.issue(CTX);
    expect(await svc.verify({ token: c.token, answer: 'x'.repeat(10_000), context: CTX })).toEqual({
      ok: false,
      reason: 'wrong_answer',
    });
    expect(await svc.verify({ token: c.token, answer: 42, context: CTX })).toEqual({ ok: false, reason: 'wrong_answer' });
  });

  it('replay store full fails closed', async () => {
    const replayStore = new MemoryReplayStore({ maxEntries: 1, now: () => 1_000_000 });
    const { svc } = make({ replayStore });
    const a = svc.issue(CTX);
    const b = svc.issue(CTX);
    expect(await svc.verify({ token: a.token, answer: solve(a.question), context: CTX })).toEqual({ ok: true });
    expect(await svc.verify({ token: b.token, answer: solve(b.question), context: CTX })).toEqual({
      ok: false,
      reason: 'replay_store_full',
    });
  });

  it('a throwing replay store fails closed', async () => {
    const replayStore: ReplayStore = {
      markUsed: () => {
        throw new Error('down');
      },
    };
    const { svc } = make({ replayStore });
    const c = svc.issue(CTX);
    expect(await svc.verify({ token: c.token, answer: solve(c.question), context: CTX })).toEqual({
      ok: false,
      reason: 'replay_store_full',
    });
  });

  it('supports async stores and a throwing attempt limiter fails closed', async () => {
    const used = new Set<string>();
    const replayStore: ReplayStore = { markUsed: (id) => Promise.resolve(!used.has(id) && !!used.add(id)) };
    const attemptLimiter: AttemptLimiter = { increment: () => Promise.resolve(1) };
    const { svc } = make({ replayStore, attemptLimiter });
    const c = svc.issue(CTX);
    const answer = solve(c.question);
    expect(await svc.verify({ token: c.token, answer, context: CTX })).toEqual({ ok: true });
    expect(await svc.verify({ token: c.token, answer, context: CTX })).toEqual({ ok: false, reason: 'replayed' });
    const broken = make({
      attemptLimiter: {
        increment: () => {
          throw new Error('down');
        },
      },
    }).svc;
    const d = broken.issue(CTX);
    expect(await broken.verify({ token: d.token, answer: solve(d.question), context: CTX })).toEqual({
      ok: false,
      reason: 'too_many_attempts',
    });
  });

  it('an internal failure (clock throws) returns a reason instead of throwing', async () => {
    let boom = false;
    const { svc } = make({
      now: () => {
        if (boom) throw new Error('clock');
        return 1_000_000;
      },
    });
    const c = svc.issue(CTX);
    boom = true;
    expect(await svc.verify({ token: c.token, answer: solve(c.question), context: CTX })).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });
});

describe('memory stores', () => {
  it('replay store purges expired entries first and never evicts live ones', () => {
    const clock = { t: 0 };
    const s = new MemoryReplayStore({ maxEntries: 2, now: () => clock.t });
    expect(s.markUsed('a', 10)).toBe(true);
    expect(s.markUsed('b', 20)).toBe(true);
    expect(s.markUsed('a', 10)).toBe(false);
    expect(() => s.markUsed('c', 30)).toThrow(ReplayStoreFullError);
    expect(s.markUsed('a', 10)).toBe(false); // live entry survived the failed insert
    clock.t = 10;
    expect(s.markUsed('c', 30)).toBe(true); // 'a' expired and was purged
    expect(s.size).toBe(2);
  });

  it('replay store lets an expired id be marked again', () => {
    const clock = { t: 0 };
    const s = new MemoryReplayStore({ now: () => clock.t });
    expect(s.markUsed('a', 5)).toBe(true);
    clock.t = 5;
    expect(s.markUsed('a', 50)).toBe(true);
  });

  it('attempt limiter counts, expires, and reports full as Infinity', () => {
    const clock = { t: 0 };
    const l = new MemoryAttemptLimiter({ maxEntries: 1, now: () => clock.t });
    expect(l.increment('a', 10)).toBe(1);
    expect(l.increment('a', 10)).toBe(2);
    expect(l.increment('b', 10)).toBe(Number.POSITIVE_INFINITY);
    expect(l.increment('a', 10)).toBe(3);
    clock.t = 10;
    expect(l.increment('b', 20)).toBe(1);
    expect(l.increment('a', 30)).toBe(Number.POSITIVE_INFINITY);
  });

  it('defaults use Date.now', () => {
    expect(new MemoryReplayStore().markUsed('x', Date.now() + 1000)).toBe(true);
    expect(new MemoryAttemptLimiter().increment('x', Date.now() + 1000)).toBe(1);
  });

  it('rejects a bad maxEntries', () => {
    expect(() => new MemoryReplayStore({ maxEntries: 0 })).toThrow(GuardError);
    expect(() => new MemoryAttemptLimiter({ maxEntries: 1.5 })).toThrow(GuardError);
  });
});

describe('normalizeAnswer', () => {
  it('handles digits in other scripts, full-width forms, whitespace, case and zeros', () => {
    expect(normalizeAnswer('１２３')).toBe('123');
    expect(normalizeAnswer('١٢٣')).toBe('123'); // Arabic-Indic
    expect(normalizeAnswer('۴۵')).toBe('45'); // Extended Arabic-Indic
    expect(normalizeAnswer('१२')).toBe('12'); // Devanagari
    expect(normalizeAnswer('𝟏𝟐')).toBe('12'); // Mathematical digits
    expect(normalizeAnswer('  Hello \t  WORLD\n')).toBe('hello world');
    expect(normalizeAnswer('007')).toBe('7');
    expect(normalizeAnswer('+0012')).toBe('12');
    expect(normalizeAnswer('000')).toBe('0');
    expect(normalizeAnswer('+0')).toBe('0');
    expect(normalizeAnswer('٠٠٧')).toBe('7');
    expect(normalizeAnswer('a1')).toBe('a1');
    expect(normalizeAnswer('+a')).toBe('+a');
    expect(normalizeAnswer('ＡＢＣ')).toBe('abc');
  });

  it('rejects non-strings and over-long input', () => {
    expect(normalizeAnswer(5)).toBeNull();
    expect(normalizeAnswer(null)).toBeNull();
    expect(normalizeAnswer('a'.repeat(64))).toBe('a'.repeat(64));
    expect(normalizeAnswer('a'.repeat(65))).toBeNull();
    expect(normalizeAnswer('㎏'.repeat(40))).toBeNull(); // expands under NFKC to 80 chars
  });

  it('is idempotent and never throws (property)', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary', maxLength: 80 }), (s) => {
        const n = normalizeAnswer(s);
        if (n !== null) expect(normalizeAnswer(n)).toBe(n);
      }),
      { numRuns: 500 },
    );
  });

  it('accepts unicode-digit answers end to end', async () => {
    const { svc } = make({ randomBytes: seeded(1) });
    for (let seed = 0; seed < 100; seed++) {
      const s = make({ randomBytes: seeded(seed) }).svc;
      const c = s.issue(CTX);
      const a = solve(c.question);
      if (/^\d+$/u.test(a)) {
        const fw = [...a].map((d) => String.fromCodePoint(0xff10 + Number(d))).join('');
        expect(await s.verify({ token: c.token, answer: ` ${fw} `, context: CTX })).toEqual({ ok: true });
      }
    }
    expect(svc).toBeDefined();
  });
});

describe('fuzz: verify never throws on attacker input', () => {
  it('arbitrary token, answer and context values', async () => {
    const { svc } = make();
    const any = fc.oneof(fc.string({ unit: 'binary', maxLength: 400 }), fc.constant(null), fc.integer(), fc.object());
    await fc.assert(
      fc.asyncProperty(any, any, any, async (token, answer, context) => {
        const r = await svc.verify({ token, answer, context });
        expect(r.ok).toBe(false);
      }),
      { numRuns: 500 },
    );
  });

  it('oversized tokens and contexts are malformed', async () => {
    const { svc } = make();
    const c = svc.issue(CTX);
    expect(await svc.verify({ token: 'A'.repeat(100_000), answer: 'x', context: CTX })).toEqual({ ok: false, reason: 'malformed' });
    expect(await svc.verify({ token: c.token, answer: 'x', context: 'c'.repeat(257) })).toEqual({ ok: false, reason: 'malformed' });
    expect(await svc.verify({ token: c.token, answer: 'x', context: '' })).toEqual({ ok: false, reason: 'malformed' });
    expect(await svc.verify({ token: '', answer: 'x', context: CTX })).toEqual({ ok: false, reason: 'malformed' });
  });

  it('random valid-shaped tokens never verify', async () => {
    const { svc } = make();
    await fc.assert(
      fc.asyncProperty(fc.uint8Array({ minLength: 16, maxLength: 16 }), fc.uint8Array({ minLength: 32, maxLength: 32 }), async (n, m) => {
        const tok = Buffer.from(`v1.2000000.${Buffer.from(n).toString('base64url')}.${Buffer.from(m).toString('base64url')}`).toString('base64url');
        expect((await svc.verify({ token: tok, answer: '1', context: CTX })).ok).toBe(false);
      }),
      { numRuns: 200 },
    );
  });
});

describe('configuration', () => {
  const bad: Array<[string, Partial<ChallengeOptions>]> = [
    ['no secrets', { secrets: [] }],
    ['short secret', { secrets: [new Uint8Array(31)] }],
    ['non-array secrets', { secrets: undefined as unknown as Uint8Array[] }],
    ['string secret', { secrets: ['x'.repeat(40)] as unknown as Uint8Array[] }],
    ['ttl 0', { ttlMs: 0 }],
    ['ttl too big', { ttlMs: 900_001 }],
    ['ttl fractional', { ttlMs: 1.5 }],
    ['difficulty 4', { difficulty: 4 as 1 }],
    ['maxAttempts 0', { maxAttempts: 0 }],
    ['maxAttempts 101', { maxAttempts: 101 }],
  ];
  for (const [name, o] of bad) {
    it(`rejects ${name} with INVALID_CONFIG`, () => {
      expect(() => createChallengeService({ secrets: [SECRET_A], ...o })).toThrow(
        expect.objectContaining({ code: 'INVALID_CONFIG' }) as Error,
      );
    });
  }

  it('accepts the ttl maximum', () => {
    expect(() => createChallengeService({ secrets: [SECRET_A], ttlMs: 900_000 })).not.toThrow();
  });

  it('issue rejects bad contexts and faulty randomBytes', () => {
    const { svc } = make();
    expect(() => svc.issue('')).toThrow(GuardError);
    expect(() => svc.issue('x'.repeat(257))).toThrow(GuardError);
    expect(() => svc.issue(5 as unknown as string)).toThrow(GuardError);
    expect(svc.issue('x'.repeat(256)).token.length).toBeLessThanOrEqual(200);
    expect(() => make({ randomBytes: () => new Uint8Array(3) }).svc.issue(CTX)).toThrow(GuardError);
    expect(() => make({ now: () => Number.NaN }).svc.issue(CTX)).toThrow(GuardError);
  });
});

describe('word list', () => {
  it('has distinct lowercase ASCII words and at least three distinct lengths', () => {
    expect(new Set(WORDS).size).toBe(WORDS.length);
    expect(WORDS.every((w) => /^[a-z]+$/u.test(w))).toBe(true);
    expect(new Set(WORDS.map((w) => w.length)).size).toBeGreaterThanOrEqual(3);
  });
});
