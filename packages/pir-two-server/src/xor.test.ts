import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { PirError } from './errors.js';
import { csprng } from './rand.js';
import { pirAnswer, pirQuery, pirReconstruct, queryBytes } from './xor.js';
import { seededRand } from './testutil.js';

const bit = (q: Uint8Array, i: number): number => ((q[i >> 3] ?? 0) >> (i & 7)) & 1;
const mkPages = (n: number, size: number, rand = seededRand('pages')): Uint8Array[] =>
  Array.from({ length: n }, () => new Uint8Array(rand(size)));

describe('known vectors', () => {
  it('3 pages, hand-computed', () => {
    const pages = [Uint8Array.of(0x01, 0x10), Uint8Array.of(0x02, 0x20), Uint8Array.of(0x04, 0x40)];
    // rand returns 0b101 = pages {0,2} for A; index 1 => B = 0b111
    const { qA, qB } = pirQuery(3, 1, () => Uint8Array.of(0b0000_0101));
    expect([...qA]).toEqual([0b101]);
    expect([...qB]).toEqual([0b111]);
    const aA = pirAnswer(pages, qA); // 01^04, 10^40
    const aB = pirAnswer(pages, qB); // 01^02^04, 10^20^40
    expect([...aA]).toEqual([0x05, 0x50]);
    expect([...aB]).toEqual([0x07, 0x70]);
    expect([...pirReconstruct(aA, aB)]).toEqual([0x02, 0x20]);
  });
  it('masks stray random tail bits (n=3, rand all ones)', () => {
    const { qA } = pirQuery(3, 0, () => Uint8Array.of(0xff));
    expect([...qA]).toEqual([0b111]);
  });
  it('n multiple of 8 keeps all bits; multi-byte index', () => {
    const { qA, qB } = pirQuery(16, 9, () => Uint8Array.of(0xff, 0x00));
    expect([...qA]).toEqual([0xff, 0x00]);
    expect([...qB]).toEqual([0xff, 0x02]);
  });
});

describe('correctness properties (NP-P-2)', () => {
  it('reconstruct == page[i] for all i, n in 1..4096', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 4096 }), fc.nat(), fc.string(), (n, k, seed) => {
        const idx = k % n;
        const rand = seededRand(seed);
        const pages = mkPages(n, 4, seededRand(`p${seed}`));
        const { qA, qB } = pirQuery(n, idx, rand);
        expect(qA.length).toBe(queryBytes(n));
        expect([...pirReconstruct(pirAnswer(pages, qA), pirAnswer(pages, qB))]).toEqual([...(pages[idx] as Uint8Array)]);
      }),
      { numRuns: 60 },
    );
  });
  it('qA xor qB == e_i exactly, for small n and random pages sizes', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 300 }), fc.nat(), fc.string(), fc.integer({ min: 1, max: 64 }), (n, k, seed, size) => {
        const idx = k % n;
        const { qA, qB } = pirQuery(n, idx, seededRand(seed));
        for (let i = 0; i < n; i++) expect(bit(qA, i) ^ bit(qB, i)).toBe(i === idx ? 1 : 0);
        const pages = mkPages(n, size, seededRand(`q${seed}`));
        expect([...pirReconstruct(pirAnswer(pages, qA), pirAnswer(pages, qB))]).toEqual([...(pages[idx] as Uint8Array)]);
      }),
      { numRuns: 100 },
    );
  });
  it('works with the real CSPRNG', () => {
    const pages = mkPages(37, 16);
    for (let i = 0; i < 37; i++) {
      const { qA, qB } = pirQuery(37, i, csprng);
      expect([...pirReconstruct(pirAnswer(pages, qA), pirAnswer(pages, qB))]).toEqual([...(pages[i] as Uint8Array)]);
    }
  });
  it('large CSPRNG draw beyond the 64 KiB WebCrypto quota', () => {
    expect(csprng(200_000).length).toBe(200_000);
    const { qA } = pirQuery(1 << 20, 5);
    expect(qA.length).toBe(1 << 17);
  });
  it('a wrong answer from one server never reconstructs the wanted page', () => {
    const pages = mkPages(20, 8);
    const { qA, qB } = pirQuery(20, 7, seededRand('x'));
    const aA = pirAnswer(pages, qA);
    const aB = pirAnswer(pages, qB);
    aB[3] = (aB[3] ?? 0) ^ 1;
    expect([...pirReconstruct(aA, aB)]).not.toEqual([...(pages[7] as Uint8Array)]);
  });
});

describe('query indistinguishability (NP-P-1, AT-NP-16)', () => {
  it('exhaustive: for n=4 every single query value is equally likely whatever the index', () => {
    const n = 4;
    for (let idx = 0; idx < n; idx++) {
      const seenA = new Map<number, number>();
      const seenB = new Map<number, number>();
      for (let r = 0; r < 16; r++) {
        const { qA, qB } = pirQuery(n, idx, () => Uint8Array.of(r));
        seenA.set(qA[0] ?? 0, (seenA.get(qA[0] ?? 0) ?? 0) + 1);
        seenB.set(qB[0] ?? 0, (seenB.get(qB[0] ?? 0) ?? 0) + 1);
      }
      // each of the 16 possible subsets occurs exactly once for A and once for B: marginals independent of idx
      expect(seenA.size).toBe(16);
      expect(seenB.size).toBe(16);
      expect([...seenA.values()].every((c) => c === 1)).toBe(true);
      expect([...seenB.values()].every((c) => c === 1)).toBe(true);
    }
  });

  function chi2(n: number, samples: number, idx: number, side: 'qA' | 'qB', seed: string): number {
    const rand = seededRand(seed);
    const ones = new Array<number>(n).fill(0);
    for (let s = 0; s < samples; s++) {
      const q = pirQuery(n, idx, rand)[side];
      for (let i = 0; i < n; i++) ones[i] = (ones[i] ?? 0) + bit(q, i);
    }
    // per-bit chi-square vs fair coin (df 1 each), summed (df n)
    let stat = 0;
    for (let i = 0; i < n; i++) {
      const o1 = ones[i] ?? 0;
      const e = samples / 2;
      stat += ((o1 - e) ** 2 + (samples - o1 - e) ** 2) / e;
    }
    return stat;
  }

  // chi-square critical value for df=64 at p=0.001 is 104.7; seeded streams make the test deterministic.
  const CRIT_64 = 104.7;
  it('qA bit frequencies are a fair coin over 20 000 samples, for several indices', () => {
    for (const idx of [0, 1, 31, 63]) {
      expect(chi2(64, 20_000, idx, 'qA', `a${String(idx)}`)).toBeLessThan(CRIT_64);
    }
  });
  it('qB alone is also uniform (each single server view)', () => {
    for (const idx of [0, 17, 63]) {
      expect(chi2(64, 20_000, idx, 'qB', `b${String(idx)}`)).toBeLessThan(CRIT_64);
    }
  });
  it('two-sample: qA distribution for index 0 vs index 63 is indistinguishable (homogeneity)', () => {
    const n = 64;
    const samples = 20_000;
    const count = (idx: number, seed: string): number[] => {
      const rand = seededRand(seed);
      const ones = new Array<number>(n).fill(0);
      for (let s = 0; s < samples; s++) {
        const q = pirQuery(n, idx, rand).qA;
        for (let i = 0; i < n; i++) ones[i] = (ones[i] ?? 0) + bit(q, i);
      }
      return ones;
    };
    const x = count(0, 'h0');
    const y = count(63, 'h63');
    let stat = 0;
    for (let i = 0; i < n; i++) {
      const a = x[i] ?? 0;
      const b = y[i] ?? 0;
      const pool = (a + b) / 2;
      stat += ((a - pool) ** 2 + (b - pool) ** 2) / pool + ((samples - a - (samples - pool)) ** 2 + (samples - b - (samples - pool)) ** 2) / (samples - pool);
    }
    expect(stat).toBeLessThan(CRIT_64);
  });
  it('statistical sanity: a deliberately leaky query (qA = e_i) is detected by the same test', () => {
    const n = 64;
    let stat = 0;
    const samples = 2_000;
    const ones = new Array<number>(n).fill(0);
    for (let s = 0; s < samples; s++) ones[5] = (ones[5] ?? 0) + 1; // leaky: bit 5 always set
    for (let i = 0; i < n; i++) {
      const o1 = ones[i] ?? 0;
      const e = samples / 2;
      stat += ((o1 - e) ** 2 + (samples - o1 - e) ** 2) / e;
    }
    expect(stat).toBeGreaterThan(CRIT_64);
  });
  it('real CSPRNG: loose bound (p < 1e-9 would fail) over 10 000 samples', () => {
    const n = 64;
    const samples = 10_000;
    const ones = new Array<number>(n).fill(0);
    for (let s = 0; s < samples; s++) {
      const q = pirQuery(n, 40).qA;
      for (let i = 0; i < n; i++) ones[i] = (ones[i] ?? 0) + bit(q, i);
    }
    let stat = 0;
    for (let i = 0; i < n; i++) {
      const o1 = ones[i] ?? 0;
      const e = samples / 2;
      stat += ((o1 - e) ** 2 + (samples - o1 - e) ** 2) / e;
    }
    expect(stat).toBeLessThan(160); // df 64: p ~ 1e-10
  });
});

describe('adversarial / invalid input', () => {
  const code = (f: () => unknown): string | undefined => {
    try {
      f();
    } catch (e) {
      return e instanceof PirError ? e.code : 'other';
    }
    return undefined;
  };
  it('rejects bad n, index', () => {
    expect(code(() => pirQuery(0, 0))).toBe('INVALID_ARGUMENT');
    expect(code(() => pirQuery(2 ** 21, 0))).toBe('INVALID_ARGUMENT');
    expect(code(() => pirQuery(1.5, 0))).toBe('INVALID_ARGUMENT');
    expect(code(() => pirQuery(8, 8))).toBe('INVALID_ARGUMENT');
    expect(code(() => pirQuery(8, -1))).toBe('INVALID_ARGUMENT');
    expect(code(() => pirQuery(8, 0.5))).toBe('INVALID_ARGUMENT');
  });
  it('rejects a bad random source (short, wrong type)', () => {
    expect(code(() => pirQuery(16, 0, () => new Uint8Array(1)))).toBe('RNG_FAILURE');
    expect(code(() => pirQuery(16, 0, () => [1, 2] as unknown as Uint8Array))).toBe('RNG_FAILURE');
  });
  it('does not alias the caller random buffer', () => {
    const buf = Uint8Array.of(0b1010);
    const { qA } = pirQuery(4, 0, () => buf);
    qA[0] = 0;
    expect(buf[0]).toBe(0b1010);
  });
  it('pirAnswer rejects wrong length, stray bits, empty, ragged pages', () => {
    const pages = mkPages(3, 4);
    expect(code(() => pirAnswer(pages, new Uint8Array(2)))).toBe('INVALID_ARGUMENT');
    expect(code(() => pirAnswer(pages, Uint8Array.of(0b1000)))).toBe('INVALID_ARGUMENT');
    expect(code(() => pirAnswer([], new Uint8Array(1)))).toBe('INVALID_ARGUMENT');
    expect(code(() => pirAnswer([new Uint8Array(0)], Uint8Array.of(1)))).toBe('INVALID_ARGUMENT');
    expect(code(() => pirAnswer([new Uint8Array(4), new Uint8Array(5)], Uint8Array.of(3)))).toBe('INVALID_ARGUMENT');
  });
  it('pirAnswer with an all-zero query returns zeros, all-ones returns XOR of all', () => {
    const pages = [Uint8Array.of(1), Uint8Array.of(2), Uint8Array.of(4)];
    expect([...pirAnswer(pages, Uint8Array.of(0))]).toEqual([0]);
    expect([...pirAnswer(pages, Uint8Array.of(7))]).toEqual([7]);
  });
  it('pirReconstruct rejects mismatched or empty answers', () => {
    expect(code(() => pirReconstruct(new Uint8Array(2), new Uint8Array(3)))).toBe('INVALID_ARGUMENT');
    expect(code(() => pirReconstruct(new Uint8Array(0), new Uint8Array(0)))).toBe('INVALID_ARGUMENT');
  });
});
