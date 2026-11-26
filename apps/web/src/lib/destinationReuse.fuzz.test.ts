import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkDestinationReuse, isOwnOneTimeAddress, type DestinationNotice } from './destinationReuse';

// Fixed seed: failures are reproducible in CI.
const RUNS = { seed: 0x52455553, numRuns: 300 } as const;
const KEY = 'ghostpay.destination-review.v1';
const NOTICES: readonly (DestinationNotice | undefined)[] = ['same-invoice', 'different-invoice', 'repeat-sweep', 'other-profile-sweep', 'unavailable', undefined];

const records = new Map<string, string>();
const storage = {
  getItem: (key: string): string | null => records.get(key) ?? null,
  setItem: (key: string, value: string): void => { records.set(key, value); },
};
const fetchSpy = vi.fn();
beforeEach(() => {
  records.clear();
  fetchSpy.mockClear();
  vi.stubGlobal('window', { sessionStorage: storage });
  vi.stubGlobal('fetch', fetchSpy);
});
afterEach(() => { vi.unstubAllGlobals(); });

/** A small address pool so that repeats actually happen. */
const POOL = Array.from({ length: 6 }, (_, i) => `0x${(i + 1).toString(16).repeat(40)}`);
const PAYERS = POOL.slice(0, 3);
const PROFILES = ['profile-a', 'profile-b', 'profile-c'];
const DIGESTS = ['a', 'b', 'c'].map((c) => c.repeat(64));

type Step =
  | { readonly kind: 'invoice'; readonly payer: number; readonly digest: number; readonly chain: number; readonly dest: number; readonly remember: boolean }
  | { readonly kind: 'sweep'; readonly profile: number; readonly chain: number; readonly dest: number; readonly remember: boolean };

const step: fc.Arbitrary<Step> = fc.oneof(
  fc.record({ kind: fc.constant('invoice' as const), payer: fc.nat(2), digest: fc.nat(2), chain: fc.constantFrom(1, 84532), dest: fc.nat(5), remember: fc.boolean() }),
  fc.record({ kind: fc.constant('sweep' as const), profile: fc.nat(2), chain: fc.constantFrom(1, 84532), dest: fc.nat(5), remember: fc.boolean() }),
);

/** Reference model of the advisory: what was remembered, as plain tuples (no salt, no hashing). */
function modelNotice(seen: readonly Step[], s: Step): DestinationNotice | undefined {
  if (s.kind === 'invoice') {
    const same = seen.filter((p): p is Extract<Step, { kind: 'invoice' }> => p.kind === 'invoice' && p.payer === s.payer && p.chain === s.chain && p.dest === s.dest);
    if (same.some((p) => p.digest !== s.digest)) return 'different-invoice';
    return same.some((p) => p.digest === s.digest) ? 'same-invoice' : undefined;
  }
  const same = seen.filter((p): p is Extract<Step, { kind: 'sweep' }> => p.kind === 'sweep' && p.chain === s.chain && p.dest === s.dest);
  if (same.some((p) => p.profile !== s.profile)) return 'other-profile-sweep';
  return same.some((p) => p.profile === s.profile) ? 'repeat-sweep' : undefined;
}

function run(s: Step): DestinationNotice | undefined {
  const candidate = s.kind === 'invoice'
    ? { kind: 'invoice' as const, payer: PAYERS[s.payer]!, invoiceDigest: DIGESTS[s.digest]! }
    : { kind: 'sweep' as const, metaAddress: PROFILES[s.profile]! };
  return checkDestinationReuse(candidate, s.chain, POOL[s.dest]!, s.remember);
}

describe('destination history (property)', () => {
  it('matches a plain reference model for short histories, stays bounded and never stores raw identifiers', () => {
    fc.assert(fc.property(fc.array(step, { maxLength: 40 }), (steps) => {
      records.clear();
      const remembered: Step[] = [];
      for (const s of steps) {
        expect(run(s)).toBe(modelNotice(remembered, s));
        // The tab history keeps one record per (scope, suffix); the model mirrors the dedupe by remembering in order.
        if (s.remember) remembered.push(s);
      }
      const raw = records.get(KEY);
      if (raw !== undefined) {
        expect(raw.length).toBeLessThan(18_000);
        for (const secret of [...POOL.map((a) => a.slice(2)), ...PROFILES, ...DIGESTS]) expect(raw).not.toContain(secret);
      }
      expect(fetchSpy).not.toHaveBeenCalled();
    }), RUNS);
  });

  it('caps the history at 128 records and forgets the oldest first', () => {
    for (let i = 0; i < 200; i++) checkDestinationReuse({ kind: 'sweep', metaAddress: 'p' }, 1, `0x${i.toString(16).padStart(40, '0')}`, true);
    const data = JSON.parse(records.get(KEY)!) as { entries: string[] };
    expect(data.entries).toHaveLength(128);
    expect(checkDestinationReuse({ kind: 'sweep', metaAddress: 'p' }, 1, `0x${(199).toString(16).padStart(40, '0')}`, false)).toBe('repeat-sweep');
    expect(checkDestinationReuse({ kind: 'sweep', metaAddress: 'p' }, 1, `0x${(0).toString(16).padStart(40, '0')}`, false)).toBeUndefined();
  });

  it('never throws and only returns a known notice for arbitrary stored bytes and inputs', () => {
    fc.assert(fc.property(
      fc.option(fc.oneof(fc.string({ maxLength: 300 }), fc.json(), fc.constantFrom('{"salt":"00","entries":[]}', '{"salt":"' + '0'.repeat(32) + '","entries":["x"]}', 'null', '[]')), { nil: undefined }),
      fc.string({ maxLength: 60 }), fc.oneof(fc.integer(), fc.double()), fc.boolean(), fc.boolean(),
      (stored, destination, chainId, remember, sweep) => {
        records.clear();
        if (stored !== undefined) records.set(KEY, stored);
        const candidate = sweep ? { kind: 'sweep' as const, metaAddress: 'p' } : { kind: 'invoice' as const, payer: POOL[0]!, invoiceDigest: DIGESTS[0]! };
        let notice: DestinationNotice | undefined;
        expect(() => { notice = checkDestinationReuse(candidate, chainId, destination, remember); }).not.toThrow();
        expect(NOTICES).toContain(notice);
        expect(() => isOwnOneTimeAddress(destination, POOL)).not.toThrow();
      },
    ), RUNS);
  });

  it('a malformed stored history is reported as unavailable and is never silently replaced', () => {
    fc.assert(fc.property(fc.string({ maxLength: 200 }).filter((s) => !/^\{"salt":"[0-9a-f]{32}","entries":\[/.test(s)), (garbage) => {
      records.clear();
      records.set(KEY, garbage);
      const notice = checkDestinationReuse({ kind: 'sweep', metaAddress: 'p' }, 1, POOL[0]!, true);
      expect(notice).toBe('unavailable');
      expect(records.get(KEY)).toBe(garbage);
    }), RUNS);
  });
});
