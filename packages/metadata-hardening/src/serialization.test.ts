import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MetadataHardeningError, type RandomSource } from './guard.js';
import {
  coarsenExpiry,
  coarsenQuoteTimestamp,
  DEFAULT_PLAINTEXT_BUCKETS,
  padLengthFor,
  padPrivatePart,
  stripPrivatePad,
} from './invoice.js';
import { DEFAULT_BODY_BUCKETS, padBody, planRelease, RelayerPinning, stripPad, validateRelayerUrls } from './release.js';
import { constRng, seededRng } from './testutil.testutil.js';

const enc = new TextEncoder();
/** Stand-in for invoice-schema's canonical JSON: sorted keys, no whitespace. */
const canon = (v: unknown): string => {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canon(o[k])}`).join(',')}}`;
};

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof MetadataHardeningError) return e.code;
    throw e;
  }
  return 'NO_THROW';
}

describe('MH-REL-3 padBody: serialization failures are typed', () => {
  it('rejects bodies that are not plain objects (regression: arrays produced invalid JSON)', () => {
    for (const v of [undefined, null, 5, 'x', true, [], [1, 2], new Map(), new Date(0), () => 1]) {
      expect(codeOf(() => padBody(v as never))).toBe('INVALID_INPUT');
    }
  });
  it('rejects values JSON cannot represent instead of leaking TypeError', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(codeOf(() => padBody({ a: 1n }))).toBe('INVALID_INPUT');
    expect(codeOf(() => padBody(circular))).toBe('INVALID_INPUT');
    expect(codeOf(() => padBody({ toJSON: () => 'string' }))).toBe('INVALID_INPUT');
    expect(codeOf(() => padBody({ toJSON: () => [1] }))).toBe('INVALID_INPUT');
    expect(codeOf(() => padBody({ toJSON: () => { throw new Error('boom'); } }))).toBe('INVALID_INPUT');
    expect(codeOf(() => padBody({ get x(): number { throw new Error('boom'); } }))).toBe('INVALID_INPUT');
  });
  it('the thrown message never carries caller data', () => {
    const o = { secret: 1n, key: 'sentinel-secret-7f3a' };
    try {
      padBody(o);
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).not.toContain('sentinel');
      expect((e as Error).message).not.toContain('secret');
    }
  });
  it('rejects an existing pad member, including an inherited one', () => {
    expect(codeOf(() => padBody({ pad: '' }))).toBe('INVALID_INPUT');
    expect(codeOf(() => padBody(Object.create({ pad: 'x' }) as Record<string, unknown>))).toBe('INVALID_INPUT');
  });
  it('validates the bucket list', () => {
    for (const b of [undefined, null, 'a', [], [0], [-1], [1.5], [NaN], ['1024'], [20_000], [1024, 'x']]) {
      if (b === undefined) continue;
      expect(codeOf(() => padBody({ a: 1 }, b as never))).toBe('INVALID_INPUT');
    }
  });
});

describe('MH-REL-3 padBody / stripPad: round trip', () => {
  const rng = seededRng(7);
  it('lands exactly on a bucket (UTF-8 bytes) and survives JSON.parse, for Unicode content', () => {
    for (const body of [
      {},
      { a: 1 },
      { memo: '日本語のメモ 😀 ünïcödé' },
      { nested: { deep: [1, 2, { x: 'é' }] }, text: '\u0000\u001f"\\' },
      { lone: '\ud800' },
    ]) {
      const wire = padBody(body, DEFAULT_BODY_BUCKETS, rng);
      expect(DEFAULT_BODY_BUCKETS).toContain(enc.encode(wire).length);
      const parsed = JSON.parse(wire) as Record<string, unknown>;
      expect(stripPad(parsed)).toEqual(JSON.parse(JSON.stringify(body)));
    }
  });
  it('property: any JSON object body round-trips and lands on a bucket', () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string({ maxLength: 12 }).filter((k) => k !== 'pad' && k !== '__proto__'), fc.jsonValue({ maxDepth: 3 }), { maxKeys: 8 }), (body) => {
        let wire: string;
        try {
          wire = padBody(body, DEFAULT_BODY_BUCKETS, seededRng(3));
        } catch (e) {
          expect((e as MetadataHardeningError).code).toBe('LIMIT_EXCEEDED');
          return;
        }
        expect(DEFAULT_BODY_BUCKETS).toContain(enc.encode(wire).length);
        expect(stripPad(JSON.parse(wire) as Record<string, unknown>)).toEqual(JSON.parse(JSON.stringify(body)));
      }),
      { seed: 0x6d68, numRuns: 300 },
    );
  });
  it('does not mutate a deeply frozen body and is repeatable with the same rng', () => {
    const body = Object.freeze({ a: Object.freeze({ b: Object.freeze([1, 2]) }) });
    const a = padBody(body, DEFAULT_BODY_BUCKETS, constRng(0xab));
    const b = padBody(body, DEFAULT_BODY_BUCKETS, constRng(0xab));
    expect(a).toBe(b);
    expect(body).toEqual({ a: { b: [1, 2] } });
  });
  it('rejects a body over the largest bucket with LIMIT_EXCEEDED, however large', () => {
    expect(codeOf(() => padBody({ x: 'a'.repeat(10_000) }))).toBe('LIMIT_EXCEEDED');
    expect(codeOf(() => padBody({ x: 'a'.repeat(5_000_000) }))).toBe('LIMIT_EXCEEDED');
  });
  it('asks the rng for far less than the 64 KiB Web Crypto limit', () => {
    let largest = 0;
    const recording: RandomSource = {
      getRandomValues<T extends ArrayBufferView | null>(a: T): T {
        if (a === null) return a;
        largest = Math.max(largest, a.byteLength);
        new Uint8Array(a.buffer, a.byteOffset, a.byteLength).fill(1);
        return a;
      },
    };
    padBody({ a: 1 }, [4096], recording);
    expect(largest).toBeLessThan(65_536);
  });
});

describe('MH-REL-3 stripPad: untrusted parsed JSON', () => {
  it('requires a plain object (regression: arrays and null leaked TypeError / index keys)', () => {
    for (const v of [undefined, null, 5, 'x', [], [1, 2, 3], new Map()]) {
      expect(codeOf(() => stripPad(v as never))).toBe('INVALID_INPUT');
    }
  });
  it('accepts only bounded lowercase hex and does not mutate', () => {
    const parsed = Object.freeze({ a: 1, pad: 'abcdef0123' });
    expect(stripPad(parsed)).toEqual({ a: 1 });
    expect(parsed.pad).toBe('abcdef0123');
    for (const pad of [1, null, 'ABCD', 'xyz', 'ab cd', 'ab\n', 'a'.repeat(16_385), ['a'], {}]) {
      expect(codeOf(() => stripPad({ a: 1, pad }))).toBe('INVALID_INPUT');
    }
    expect(stripPad({ a: 1, pad: '' })).toEqual({ a: 1 });
  });
  it('is idempotent and unaffected by a JSON-parsed __proto__ member', () => {
    const parsed = JSON.parse('{"__proto__":{"polluted":true},"a":1,"pad":"00"}') as Record<string, unknown>;
    const once = stripPad(parsed);
    expect(Object.getPrototypeOf(once)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(stripPad(once)).toEqual(once);
  });
});

describe('MH-INV-1 padPrivatePart / stripPrivatePad', () => {
  const part = { lineItems: [{ d: 'Kaffee ☕', q: 2 }], memo: 'Danke! 感谢 🙏' };
  it('hits a bucket measured in UTF-8 bytes and strips back to the original', () => {
    const padded = padPrivatePart(part, canon);
    expect(DEFAULT_PLAINTEXT_BUCKETS).toContain(enc.encode(canon(padded)).length);
    expect(stripPrivatePad(padded)).toEqual(part);
    expect(stripPrivatePad(stripPrivatePad(padded))).toEqual(part);
  });
  it('rejects non-object parts, an existing or inherited pad, and a bad canonicalizer', () => {
    for (const v of [undefined, null, 5, 'x', [], [1]]) {
      expect(codeOf(() => padPrivatePart(v as never, canon))).toBe('INVALID_INPUT');
      expect(codeOf(() => stripPrivatePad(v as never))).toBe('INVALID_INPUT');
    }
    expect(codeOf(() => padPrivatePart({ pad: '' }, canon))).toBe('INVALID_INPUT');
    expect(codeOf(() => padPrivatePart(Object.create({ pad: '' }) as Record<string, unknown>, canon))).toBe('INVALID_INPUT');
    for (const c of [undefined, null, 'x', {}]) {
      expect(codeOf(() => padPrivatePart(part, c as never))).toBe('INVALID_INPUT');
    }
    expect(codeOf(() => padPrivatePart(part, () => 5 as never))).toBe('INVALID_INPUT');
    expect(codeOf(() => padPrivatePart(part, () => undefined as never))).toBe('INVALID_INPUT');
    expect(codeOf(() => padPrivatePart(part, () => '{"a":1}'))).toBe('INVALID_INPUT'); // not bucket sized
  });
  it('wraps a throwing canonicalizer and the caller error text is not propagated', () => {
    try {
      padPrivatePart(part, () => {
        throw new Error('sentinel-secret-7f3a');
      });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(MetadataHardeningError);
      expect((e as Error).message).not.toContain('sentinel');
    }
  });
  it('rejects non-canonical, oversized or non-string padding', () => {
    for (const pad of [1, null, 'a', '0 0', '00\n', '0'.repeat(16_385), [], {}]) {
      expect(codeOf(() => stripPrivatePad({ memo: 'x', pad }))).toBe('INVALID_INPUT');
    }
    expect(stripPrivatePad({ memo: 'x', pad: '' })).toEqual({ memo: 'x' });
    expect(stripPrivatePad({ memo: 'x' })).toEqual({ memo: 'x' });
  });
  it('bounds the bucket list (regression: a 1e12 bucket tried to allocate a terabyte)', () => {
    expect(codeOf(() => padLengthFor(10, [1e12]))).toBe('INVALID_INPUT');
    expect(codeOf(() => padLengthFor(10, [16_385]))).toBe('INVALID_INPUT');
    expect(codeOf(() => padLengthFor(10, 'x' as never))).toBe('INVALID_INPUT');
    expect(codeOf(() => padLengthFor('10' as never))).toBe('INVALID_INPUT');
    expect(padLengthFor(10, [16_384])).toEqual({ target: 16_384, padChars: 16_384 - 10 - 9 });
    expect(codeOf(() => padPrivatePart({ memo: 'x'.repeat(5000) }, canon))).toBe('LIMIT_EXCEEDED');
  });
  it('property: padded plaintext length is always a bucket and the pad is removable', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary', maxLength: 500 }), (memo) => {
        let padded: Record<string, unknown>;
        try {
          padded = padPrivatePart({ memo }, canon);
        } catch (e) {
          expect((e as MetadataHardeningError).code).toBe('LIMIT_EXCEEDED');
          return;
        }
        expect(DEFAULT_PLAINTEXT_BUCKETS).toContain(enc.encode(canon(padded)).length);
        expect(stripPrivatePad(padded)).toEqual({ memo });
      }),
      { seed: 0x6d68, numRuns: 300 },
    );
  });
});

describe('MH-INV-3 coarse time: exact integer arithmetic near 2^53', () => {
  it('rounds up and down without float error (property over a bigint oracle)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2 ** 52, max: Number.MAX_SAFE_INTEGER - 86_400 }), fc.integer({ min: 1, max: 86_400 }), (t, g) => {
        const T = BigInt(t);
        const G = BigInt(g);
        const up = coarsenExpiry(t, { chainId: 31337, gridSec: g });
        expect(BigInt(up)).toBe(((T + G - 1n) / G) * G);
        const down = coarsenQuoteTimestamp(t, t, { chainId: 31337, gridSec: g });
        expect(BigInt(down)).toBe((T / G) * G);
      }),
      { seed: 0x6d68, numRuns: 500 },
    );
  });
});

describe('MH-INV-3 coarse time: runtime types and range', () => {
  it('needs an options object and integer seconds', () => {
    for (const o of [undefined, null, 5, 'x', []]) {
      expect(codeOf(() => coarsenExpiry(5, o as never))).toBe('INVALID_INPUT');
      expect(codeOf(() => coarsenQuoteTimestamp(5, 10, o as never))).toBe('INVALID_INPUT');
    }
    for (const v of [undefined, null, '5', 1.5, NaN, Infinity, -1]) {
      expect(codeOf(() => coarsenExpiry(v as never, { chainId: 31337 }))).toBe('INVALID_INPUT');
    }
    expect(codeOf(() => coarsenExpiry(5, { chainId: 1 }))).toBe('UNSUPPORTED_CHAIN');
  });
  it('never returns an unsafe integer (regression: MAX_SAFE_INTEGER rounded up past 2^53)', () => {
    expect(codeOf(() => coarsenExpiry(Number.MAX_SAFE_INTEGER, { chainId: 31337 }))).toBe('LIMIT_EXCEEDED');
    expect(coarsenExpiry(2 ** 40 + 1, { chainId: 31337 })).toBe(Math.ceil((2 ** 40 + 1) / 3600) * 3600);
  });
  it('is idempotent and bounded by the grid', () => {
    fc.assert(
      fc.property(fc.nat({ max: 2 ** 40 }), fc.integer({ min: 1, max: 86_400 }), (t, g) => {
        const c = coarsenExpiry(t, { chainId: 31337, gridSec: g });
        expect(c).toBeGreaterThanOrEqual(t);
        expect(c - t).toBeLessThan(g);
        expect(coarsenExpiry(c, { chainId: 31337, gridSec: g })).toBe(c);
        const q = coarsenQuoteTimestamp(t, t + 5, { chainId: 31337, gridSec: g });
        expect(q).toBeLessThanOrEqual(t);
        expect(t - q).toBeLessThan(g);
        expect(coarsenQuoteTimestamp(q, t + 5, { chainId: 31337, gridSec: g })).toBe(q);
      }),
      { seed: 0x6d68, numRuns: 300 },
    );
  });
});

describe('MH-REL-2/4 planRelease and RelayerPinning: runtime types and size', () => {
  const opts = { chainId: 31337, nowMs: 0, windowSec: 10 };
  it('planRelease validates its inputs', () => {
    for (const v of [undefined, null, 'x', {}, 5]) {
      expect(codeOf(() => planRelease(v as never, opts))).toBe('INVALID_INPUT');
    }
    for (const s of [null, 5, 'x', { id: 5, deadlineSec: 1e9 }, { id: '', deadlineSec: 1e9 }, { id: 'a', deadlineSec: '1e9' }, { id: 'a', deadlineSec: NaN }, { id: 'a' }]) {
      expect(codeOf(() => planRelease([s as never], opts))).toBe('INVALID_INPUT');
    }
    for (const o of [undefined, null, 5, 'x']) {
      expect(codeOf(() => planRelease([], o as never))).toBe('INVALID_INPUT');
    }
    expect(codeOf(() => planRelease([], { ...opts, nowMs: '0' as never }))).toBe('INVALID_INPUT');
    expect(planRelease([], opts)).toEqual([]);
  });
  it('planRelease does not mutate frozen input and is deterministic per rng', () => {
    const sweeps = Object.freeze([Object.freeze({ id: 'a', deadlineSec: 1e9 }), Object.freeze({ id: 'b', deadlineSec: 1e9 })]);
    expect(planRelease(sweeps, opts, seededRng(5))).toEqual(planRelease(sweeps, opts, seededRng(5)));
  });
  it('bounds the number of pending sweeps', () => {
    const many = Array.from({ length: 100_001 }, (_, i) => ({ id: String(i), deadlineSec: 1e9 }));
    expect(codeOf(() => planRelease(many, opts))).toBe('LIMIT_EXCEEDED');
  });
  it('RelayerPinning needs string ids and bounds its memory', () => {
    const pin = new RelayerPinning(['https://a.example', 'https://b.example'], seededRng(1));
    for (const id of [undefined, null, 5, ['x'], {}, '', 'x'.repeat(129)]) {
      expect(codeOf(() => pin.assign(id as never))).toBe('INVALID_INPUT');
    }
    for (let i = 0; i < 4096; i++) pin.assign(`s${i}`);
    expect(codeOf(() => pin.assign('one-too-many'))).toBe('LIMIT_EXCEEDED');
    pin.release('s0');
    expect(() => pin.assign('one-too-many')).not.toThrow();
    expect(pin.assign('s1')).toBe(pin.assign('s1'));
  });
  it('validateRelayerUrls needs an array of strings', () => {
    for (const v of [undefined, null, 'https://a.example', {}]) {
      expect(codeOf(() => validateRelayerUrls(v as never))).toBe('INVALID_INPUT');
    }
    expect(codeOf(() => validateRelayerUrls([5 as never]))).toBe('INVALID_INPUT');
    expect(validateRelayerUrls(Object.freeze(['https://a.example/', 'https://b.example']))).toEqual(['https://a.example', 'https://b.example']);
  });
});
