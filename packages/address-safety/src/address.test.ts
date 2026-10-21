import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { Address } from 'viem';
import { AddressSafetyError, isReason } from './errors.js';
import {
  classifyDestination,
  findLookalikes,
  fingerprint,
  lookalikeScore,
  parseStrictAddress,
} from './address.js';

const VECTORS = [
  '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
  '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359',
  '0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB',
  '0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb',
] as const;
const A = VECTORS[0] as Address;
const B = VECTORS[1] as Address;

function ok(s: string): Address {
  const r = parseStrictAddress(s);
  if (isReason(r)) throw new Error(`unexpected ${r.reason}`);
  return r;
}

/** Same first/last n nibbles as `base`, different middle. */
function lookalike(base: Address, n: number): Address {
  const h = base.slice(2).toLowerCase();
  const mid = h.slice(n, 40 - n);
  const flipped = (mid[0] === 'a' ? 'b' : 'a') + mid.slice(1);
  return ok(`0x${h.slice(0, n)}${flipped}${h.slice(40 - n)}`);
}

describe('parseStrictAddress', () => {
  it.each(VECTORS)('accepts EIP-55 vector %s', (v) => {
    expect(parseStrictAddress(v)).toBe(v);
  });

  it.each(VECTORS)('accepts all-lowercase and canonicalises %s', (v) => {
    expect(parseStrictAddress(v.toLowerCase())).toBe(v);
  });

  it('rejects all-uppercase', () => {
    expect(parseStrictAddress(`0x${A.slice(2).toUpperCase()}`)).toEqual({
      ok: false,
      reason: 'all_uppercase',
    });
  });

  it('accepts digit-only addresses', () => {
    expect(isReason(parseStrictAddress(`0x${'1'.repeat(40)}`))).toBe(false);
  });

  it('rejects a flipped-case checksum', () => {
    const bad = A.replace('aAeb', 'AAeb');
    expect(parseStrictAddress(bad)).toEqual({ ok: false, reason: 'bad_checksum' });
  });

  it.each([
    ['', 'bad_length'],
    ['0x1234', 'bad_length'],
    [` ${A}`, 'bad_length'],
    [`0X${A.slice(2)}`, 'bad_format'],
    [`0x${'g'.repeat(40)}`, 'bad_format'],
    [`${A}\n`, 'bad_length'],
  ])('rejects %j', (s, reason) => {
    expect(parseStrictAddress(s)).toEqual({ ok: false, reason });
  });

  it('rejects non-strings', () => {
    expect(parseStrictAddress(5 as unknown as string)).toEqual({ ok: false, reason: 'not_a_string' });
  });

  it('flips of a valid checksum are almost always rejected', () => {
    fc.assert(
      fc.property(fc.constantFrom(...VECTORS), fc.integer({ min: 2, max: 41 }), (v, i) => {
        const c = v[i] ?? '';
        if (!/[a-fA-F]/.test(c)) return true;
        const flipped = c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase();
        const mutated = v.slice(0, i) + flipped + v.slice(i + 1);
        return parseStrictAddress(mutated) !== mutated;
      }),
    );
  });
});

describe('lookalikeScore', () => {
  it('scores identical addresses', () => {
    expect(lookalikeScore(A, A)).toEqual({ prefix: 40, suffix: 40, hamming: 0 });
  });

  it('is case-insensitive', () => {
    expect(lookalikeScore(A, A.toLowerCase() as Address).hamming).toBe(0);
  });

  it('counts prefix, suffix and hamming', () => {
    const b = `0x5aAe${'0'.repeat(32)}eAed` as Address;
    const s = lookalikeScore(A, b);
    expect(s.prefix).toBe(4);
    expect(s.suffix).toBe(4);
    expect(s.hamming).toBeGreaterThan(0);
  });

  it('throws on malformed input', () => {
    expect(() => lookalikeScore('0x12', A)).toThrow(AddressSafetyError);
  });
});

describe('findLookalikes', () => {
  it.each([4, 5, 6, 7, 8])('flags generated pair matching %i nibbles', (n) => {
    for (const v of VECTORS) {
      const bad = lookalike(v, n);
      expect(findLookalikes(bad, [v], { prefix: n, suffix: n })).toEqual([v]);
      expect(findLookalikes(v, [bad], { prefix: n, suffix: n })).toEqual([bad]);
    }
  });

  it('does not flag when fewer nibbles match than required', () => {
    const bad = lookalike(A, 4);
    expect(findLookalikes(bad, [A], { prefix: 8, suffix: 8 })).toEqual([]);
    expect(findLookalikes(bad, [A], { prefix: 8, suffix: 4 })).toEqual([]);
  });

  it('does not flag exact matches in any case', () => {
    expect(findLookalikes(A, [A, A.toLowerCase() as Address])).toEqual([]);
  });

  it('does not flag unrelated addresses', () => {
    expect(findLookalikes(A, [B])).toEqual([]);
  });

  it('property: findLookalikes(x, [x]) is empty', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[0-9a-f]{40}$/), (h) => {
        const x = ok(`0x${h}`);
        return findLookalikes(x, [x]).length === 0;
      }),
    );
  });

  it('property: single-nibble middle mutation is flagged', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[0-9a-f]{40}$/), fc.integer({ min: 4, max: 35 }), (h, i) => {
        const lower = h.toLowerCase();
        const c = lower[i] === '0' ? '1' : '0';
        const y = `0x${lower.slice(0, i)}${c}${lower.slice(i + 1)}` as Address;
        return findLookalikes(y, [`0x${lower}`]).length === 1;
      }),
    );
  });

  it.each([0, 21, 1.5, Number.NaN])('rejects bad nibble count %s', (n) => {
    expect(() => findLookalikes(A, [B], { prefix: n })).toThrow(AddressSafetyError);
    expect(() => findLookalikes(A, [B], { suffix: n })).toThrow(AddressSafetyError);
  });
});

describe('classifyDestination', () => {
  const stealth = VECTORS[2] as Address;
  const fee = VECTORS[3] as Address;
  const ctx = { saved: [A], ownStealth: [stealth], feeRecipients: [fee] };

  it('classifies exact matches', () => {
    expect(classifyDestination(A.toLowerCase() as Address, ctx)).toBe('saved');
    expect(classifyDestination(stealth, ctx)).toBe('own_stealth');
    expect(classifyDestination(fee, ctx)).toBe('fee_recipient');
  });

  it('flags a lookalike of a saved address', () => {
    expect(classifyDestination(lookalike(A, 4), ctx)).toBe('lookalike_of_saved');
  });

  it('classifies unknown as new, with or without recent counterparties', () => {
    expect(classifyDestination(B, ctx)).toBe('new');
    expect(classifyDestination(B, { ...ctx, recentCounterparties: [B] })).toBe('new');
  });

  it('exact saved match beats lookalike of another saved address', () => {
    const near = lookalike(A, 4);
    expect(classifyDestination(near, { ...ctx, saved: [A, near] })).toBe('saved');
  });
});

describe('fingerprint', () => {
  it('snapshot: fixed groups of four, full length', () => {
    expect(fingerprint(A)).toBe('0x5aAe b605 3F3E 94C9 b9A0 9f33 6694 35E7 Ef1B eAed');
    expect(fingerprint(A.toLowerCase() as Address)).toBe(fingerprint(A));
  });

  it('is never truncated', () => {
    expect(fingerprint(B).replaceAll(' ', '')).toBe(B);
  });

  it('throws on malformed input', () => {
    expect(() => fingerprint('0x12')).toThrow(AddressSafetyError);
    expect(() => fingerprint(1 as unknown as Address)).toThrow(AddressSafetyError);
  });
});
