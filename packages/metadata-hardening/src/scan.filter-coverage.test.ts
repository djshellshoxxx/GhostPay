import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MetadataHardeningError } from './guard.js';
import { alignedScanRange, assertNoUserAddressFilter, dedupeLogs, roleForRequest, validateRpcRoles } from './scan.js';
import { seededRng } from './testutil.testutil.js';

const ME = `0x${'ab'.repeat(20)}`;
const TOPIC_ME = `0x${'0'.repeat(24)}${'ab'.repeat(20)}`;
const OTHER = `0x${'cd'.repeat(20)}`;
const SCHEME_1 = `0x${'0'.repeat(63)}1`;
const EVENT = `0x${'ee'.repeat(32)}`;

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof MetadataHardeningError) return e.code;
    throw e;
  }
  return 'NO_THROW';
}

describe('MH-SCAN-1 assertNoUserAddressFilter covers every place an address can leak', () => {
  it('rejects a user address in the contract address field, topic0 or topic1 (regression: only topic2/3 were checked)', () => {
    expect(codeOf(() => assertNoUserAddressFilter({ address: ME }, [ME]))).toBe('POLICY_REJECTED');
    expect(codeOf(() => assertNoUserAddressFilter({ address: [OTHER, ME.toUpperCase().replace('0X', '0x')] }, [ME]))).toBe('POLICY_REJECTED');
    expect(codeOf(() => assertNoUserAddressFilter({ topics: [TOPIC_ME] }, [ME]))).toBe('POLICY_REJECTED');
    expect(codeOf(() => assertNoUserAddressFilter({ topics: [EVENT, TOPIC_ME] }, [ME]))).toBe('POLICY_REJECTED');
    expect(codeOf(() => assertNoUserAddressFilter({ topics: [EVENT, [SCHEME_1, TOPIC_ME]] }, [ME]))).toBe('POLICY_REJECTED');
  });
  it('matches an unpadded 20-byte value in a topic slot', () => {
    expect(codeOf(() => assertNoUserAddressFilter({ topics: [EVENT, SCHEME_1, ME] }, [ME]))).toBe('POLICY_REJECTED');
  });
  it('accepts the scheme-only announcement filter for an announcer', () => {
    expect(codeOf(() => assertNoUserAddressFilter({ address: OTHER, topics: [EVENT, SCHEME_1] }, [ME]))).toBe('NO_THROW');
    expect(codeOf(() => assertNoUserAddressFilter({}, [ME]))).toBe('NO_THROW');
    expect(codeOf(() => assertNoUserAddressFilter({ topics: [EVENT, SCHEME_1, null, null] }, []))).toBe('NO_THROW');
  });
  it('strict mode still rejects any topic2/topic3 constraint, including an empty or-list', () => {
    expect(codeOf(() => assertNoUserAddressFilter({ topics: [EVENT, SCHEME_1, []] }, [ME], true))).toBe('POLICY_REJECTED');
    expect(codeOf(() => assertNoUserAddressFilter({ topics: [EVENT, SCHEME_1, null, OTHER] }, [ME], true))).toBe('POLICY_REJECTED');
  });
  it('fails typed on malformed filters and address lists', () => {
    for (const f of [undefined, null, 5, 'x', []]) {
      expect(codeOf(() => assertNoUserAddressFilter(f as never, [ME]))).toBe('INVALID_INPUT');
    }
    for (const topics of ['x', 5, {}, [5], [[5]], [{}]]) {
      expect(codeOf(() => assertNoUserAddressFilter({ topics } as never, [ME]))).toBe('INVALID_INPUT');
    }
    for (const address of [5, {}, [5], null]) {
      expect(codeOf(() => assertNoUserAddressFilter({ address } as never, [ME]))).toBe('INVALID_INPUT');
    }
    for (const list of [undefined, null, 'x', {}, [5], ['0x12'], ['not an address'], [`0x${'g'.repeat(40)}`]]) {
      expect(codeOf(() => assertNoUserAddressFilter({}, list as never))).toBe('INVALID_INPUT');
    }
  });
  it('error text never contains a user address', () => {
    try {
      assertNoUserAddressFilter({ address: ME }, [ME]);
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).not.toContain('abab');
    }
  });
  it('property: any filter that places the address anywhere is rejected, any other accepted', () => {
    const slot = fc.constantFrom('address', 'topic0', 'topic1', 'topic2', 'topic3');
    fc.assert(
      fc.property(slot, fc.boolean(), fc.boolean(), fc.boolean(), (where, padded, upper, inList) => {
        const val = padded ? TOPIC_ME : ME;
        const v = upper ? `0x${val.slice(2).toUpperCase()}` : val;
        const item = inList ? [OTHER, v] : v;
        const filter =
          where === 'address'
            ? { address: padded ? ME : (item) }
            : { topics: Array.from({ length: Number(where.slice(5)) + 1 }, (_, i) => (i === Number(where.slice(5)) ? item : null)) };
        expect(codeOf(() => assertNoUserAddressFilter(filter as never, [ME]))).toBe('POLICY_REJECTED');
      }),
      { seed: 0x6d68, numRuns: 200 },
    );
  });
  it('does not mutate a frozen filter or address list', () => {
    const filter = Object.freeze({ address: OTHER, topics: Object.freeze([EVENT, SCHEME_1]) });
    const mine = Object.freeze([ME]);
    expect(() => assertNoUserAddressFilter(filter, mine)).not.toThrow();
  });
});

describe('MH-NET-1 roleForRequest fails closed to the query role', () => {
  it('malformed filters and unknown shapes go to query, never to scan', () => {
    for (const f of [null, 5, 'x', [], { topics: 'x' }, { topics: [5] }, { address: 5 }, { address: [5] }]) {
      expect(roleForRequest('eth_getLogs', f as never, [ME])).toBe('query');
    }
    for (const m of [undefined, null, 5, {}, 'eth_call', 'eth_getBalance', 'eth_sendRawTransaction', '__proto__', 'constructor']) {
      expect(roleForRequest(m as never, undefined, [ME])).toBe('query');
    }
  });
  it('still routes the scheme-only scan filter to scan and a user-address filter to query', () => {
    expect(roleForRequest('eth_getLogs', { address: OTHER, topics: [EVENT, SCHEME_1] }, [ME])).toBe('scan');
    expect(roleForRequest('eth_getLogs', { topics: [EVENT, SCHEME_1, TOPIC_ME] }, [ME])).toBe('query');
    expect(roleForRequest('eth_getLogs', { address: ME }, [ME])).toBe('query');
    expect(roleForRequest('eth_blockNumber', undefined, [ME])).toBe('scan');
  });
  it('rejects a malformed owned-address list', () => {
    expect(codeOf(() => roleForRequest('eth_getLogs', {}, 'x' as never))).toBe('INVALID_INPUT');
    expect(codeOf(() => roleForRequest('eth_getLogs', {}, [5 as never]))).toBe('INVALID_INPUT');
  });
});

describe('MH-NET-1 validateRpcRoles', () => {
  it('needs an object config with string endpoints', () => {
    for (const c of [undefined, null, 5, 'x', [], {}, { scan: 'https://a.example' }, { scan: 5, query: 'https://a.example' }]) {
      expect(codeOf(() => validateRpcRoles(31337, c as never))).toBe('INVALID_INPUT');
    }
    expect(validateRpcRoles(31337, { scan: 'https://a.example/', query: 'https://b.example' })).toEqual({
      scan: 'https://a.example',
      query: 'https://b.example',
      separated: true,
    });
  });
  it('error text omits both URLs', () => {
    try {
      validateRpcRoles(31337, { scan: 'https://secret-host.example/?k=1', query: 'https://b.example' });
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).not.toContain('secret-host');
    }
  });
});

describe('MH-SCAN-2 alignedScanRange: bounds and shape', () => {
  const o = { chainId: 31337, wantedFrom: 12_345, head: 15_345 };
  it('needs an options object', () => {
    for (const v of [undefined, null, 5, 'x', []]) {
      expect(codeOf(() => alignedScanRange(v as never))).toBe('INVALID_INPUT');
    }
  });
  it('bounds the request budget and window count (regression: 50 000 windows were allowed)', () => {
    expect(codeOf(() => alignedScanRange({ ...o, maxRequests: 10_001 }))).toBe('INVALID_INPUT');
    expect(alignedScanRange({ ...o, head: 100_000, maxRequests: 10_000, windowSize: 1 }).windows).toHaveLength(10_000);
    expect(codeOf(() => alignedScanRange({ ...o, grid: 2 ** 53 }))).toBe('INVALID_INPUT');
  });
  it('never overflows safe-integer arithmetic near the top of the range', () => {
    const r = alignedScanRange({ chainId: 31337, wantedFrom: Number.MAX_SAFE_INTEGER - 10, head: Number.MAX_SAFE_INTEGER - 1, windowSize: 4 }, seededRng(1));
    for (const w of r.windows) {
      expect(Number.isSafeInteger(w.from)).toBe(true);
      expect(Number.isSafeInteger(w.to)).toBe(true);
    }
  });
  it('property: windows are contiguous, ordered, cover the aligned start, and truncation is honest', () => {
    fc.assert(
      fc.property(fc.nat({ max: 1_000_000 }), fc.nat({ max: 50_000 }), fc.integer({ min: 1, max: 5000 }), fc.integer({ min: 1, max: 60 }), (from, span, windowSize, maxRequests) => {
        const r = alignedScanRange({ chainId: 31337, wantedFrom: from, head: from + span, windowSize, maxRequests }, seededRng(from + 1));
        expect(r.fromBlock % 10_000).toBe(0);
        expect(r.fromBlock).toBeLessThanOrEqual(from);
        expect(r.windows[0]?.from).toBe(r.fromBlock);
        for (let i = 1; i < r.windows.length; i++) expect(r.windows[i]?.from).toBe((r.windows[i - 1]?.to as number) + 1);
        expect(r.windows.length).toBeLessThanOrEqual(maxRequests);
        expect(r.truncated).toBe(r.toBlock < from + span);
        expect(r.discardBefore).toBe(from);
      }),
      { seed: 0x6d68, numRuns: 300 },
    );
  });
});

describe('MH-SCAN-2 dedupeLogs: untrusted log objects', () => {
  const key = (l: { blockNumber: number; id?: string }): string => `${l.blockNumber}:${l.id ?? ''}`;
  it('rejects non-integer block numbers instead of silently keeping the log (regression: NaN passed)', () => {
    for (const blockNumber of [NaN, Infinity, -1, 1.5, '5', null, undefined, -5n]) {
      expect(codeOf(() => dedupeLogs([{ blockNumber } as never], 0, new Set(), key))).toBe('INVALID_INPUT');
    }
  });
  it('validates containers and the key callback', () => {
    expect(codeOf(() => dedupeLogs(null as never, 0, new Set(), key))).toBe('INVALID_INPUT');
    expect(codeOf(() => dedupeLogs([], 0, [] as never, key))).toBe('INVALID_INPUT');
    expect(codeOf(() => dedupeLogs([], 0, new Set(), null as never))).toBe('INVALID_INPUT');
    expect(codeOf(() => dedupeLogs([], -1, new Set(), key))).toBe('INVALID_INPUT');
    expect(codeOf(() => dedupeLogs([{ blockNumber: 1 }], 0, new Set(), (() => 5) as never))).toBe('INVALID_INPUT');
    expect(codeOf(() => dedupeLogs([{ blockNumber: 1 }], 0, new Set(), () => { throw new Error('sentinel'); }))).toBe('INVALID_INPUT');
  });
  it('keeps first sight, drops old logs, does not mutate input, and is idempotent across calls', () => {
    const logs = Object.freeze([{ blockNumber: 5, id: 'a' }, { blockNumber: 1, id: 'old' }, { blockNumber: 5, id: 'a' }, { blockNumber: 6, id: 'b' }]);
    const seen = new Set<string>();
    expect(dedupeLogs(logs, 5, seen, key)).toEqual([{ blockNumber: 5, id: 'a' }, { blockNumber: 6, id: 'b' }]);
    expect(dedupeLogs(logs, 5, seen, key)).toEqual([]);
    expect(logs).toHaveLength(4);
  });
});
