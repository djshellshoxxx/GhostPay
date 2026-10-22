import { describe, expect, it } from 'vitest';
import { alignedScanRange, assertNoUserAddressFilter, dedupeLogs, roleForRequest, validateRpcRoles } from './scan.js';
import { MetadataHardeningError } from './guard.js';
import { seededRng } from './testutil.testutil.js';

const me = '0x' + 'ab'.repeat(20);
const topicMe = '0x' + '0'.repeat(24) + 'ab'.repeat(20);

describe('MH-SCAN-1 no per-address filter', () => {
  it('accepts the scheme-only filter', () => {
    expect(() => assertNoUserAddressFilter({ topics: ['0xaa', '0x01'] }, [me])).not.toThrow();
    expect(() => assertNoUserAddressFilter({ topics: ['0xaa', '0x01', null, null] }, [me])).not.toThrow();
  });
  it('rejects a user address in topic2 or topic3 (padded, any case, in an OR list)', () => {
    expect(() => assertNoUserAddressFilter({ topics: ['0xaa', '0x01', topicMe] }, [me])).toThrow(MetadataHardeningError);
    expect(() => assertNoUserAddressFilter({ topics: ['0xaa', '0x01', null, topicMe.toUpperCase().replace('0X', '0x')] }, [me.toUpperCase().replace('0X', '0x')])).toThrow(MetadataHardeningError);
    expect(() => assertNoUserAddressFilter({ topics: ['0xaa', '0x01', ['0x' + '1'.repeat(64), topicMe]] }, [me])).toThrow(MetadataHardeningError);
  });
  it('strict mode rejects any topic2/3 constraint', () => {
    expect(() => assertNoUserAddressFilter({ topics: ['0xaa', '0x01', '0x' + '1'.repeat(64)] }, [me], true)).toThrow(MetadataHardeningError);
    expect(() => assertNoUserAddressFilter({ topics: ['0xaa'] }, [me], true)).not.toThrow();
  });
});

describe('MH-SCAN-2 aligned ranges', () => {
  it('first request is aligned for 3000 blocks (anvil-like), with random lookback', () => {
    const rng = seededRng(1);
    for (let i = 0; i < 200; i++) {
      const r = alignedScanRange({ chainId: 31337, wantedFrom: 12_345, head: 15_345 }, rng);
      expect(r.fromBlock % 10_000).toBe(0);
      expect(r.fromBlock).toBeLessThanOrEqual(10_000);
      expect(r.windows[0]?.from).toBe(r.fromBlock);
      expect(r.discardBefore).toBe(12_345);
    }
  });
  it('covers to head contiguously within budget, no gaps or overlaps', () => {
    const r = alignedScanRange({ chainId: 31337, wantedFrom: 12_345, head: 15_345, maxExtraGrids: 0 }, seededRng(1));
    expect(r.fromBlock).toBe(10_000);
    expect(r.truncated).toBe(false);
    expect(r.toBlock).toBe(15_345);
    for (let i = 1; i < r.windows.length; i++) expect(r.windows[i]?.from).toBe((r.windows[i - 1]?.to ?? 0) + 1);
    for (const w of r.windows) expect(w.to - w.from + 1).toBeLessThanOrEqual(1000);
  });
  it('sets truncated honestly when the budget runs out', () => {
    const r = alignedScanRange({ chainId: 84532, wantedFrom: 0, head: 100_000, maxExtraGrids: 0, maxRequests: 50 });
    expect(r.windows).toHaveLength(50);
    expect(r.truncated).toBe(true);
    expect(r.toBlock).toBe(49_999);
  });
  it('clamps lookback at block 0 and handles wantedFrom == head', () => {
    const r = alignedScanRange({ chainId: 31337, wantedFrom: 5, head: 5, maxExtraGrids: 3 }, seededRng(4));
    expect(r.fromBlock).toBe(0);
    expect(r.windows.at(-1)?.to).toBe(5);
  });
  it('validates', () => {
    const ok = { chainId: 31337, wantedFrom: 10, head: 20 };
    expect(() => alignedScanRange({ ...ok, chainId: 1 })).toThrow(MetadataHardeningError);
    expect(() => alignedScanRange({ ...ok, grid: 0 })).toThrow(MetadataHardeningError);
    expect(() => alignedScanRange({ ...ok, maxExtraGrids: -1 })).toThrow(MetadataHardeningError);
    expect(() => alignedScanRange({ ...ok, windowSize: 0 })).toThrow(MetadataHardeningError);
    expect(() => alignedScanRange({ ...ok, maxRequests: 0 })).toThrow(MetadataHardeningError);
    expect(() => alignedScanRange({ ...ok, wantedFrom: -1 })).toThrow(MetadataHardeningError);
    expect(() => alignedScanRange({ ...ok, head: 5 })).toThrow(MetadataHardeningError);
  });
  it('dedupe drops old and repeated logs', () => {
    const seen = new Set<string>();
    const logs = [
      { blockNumber: 5, k: 'a' },
      { blockNumber: 10, k: 'b' },
      { blockNumber: 11, k: 'c' },
    ];
    const first = dedupeLogs(logs, 10, seen, (l) => l.k);
    expect(first.map((l) => l.k)).toEqual(['b', 'c']);
    expect(dedupeLogs([...logs, { blockNumber: 12, k: 'd' }], 10, seen, (l) => l.k).map((l) => l.k)).toEqual(['d']);
  });
});

describe('MH-NET-1 role routing', () => {
  it('bulk log reads go to scan; per-address and broadcast go to query', () => {
    expect(roleForRequest('eth_getLogs', { topics: ['0xaa', '0x01'] }, [me])).toBe('scan');
    expect(roleForRequest('eth_getLogs', undefined, [me])).toBe('scan');
    expect(roleForRequest('eth_blockNumber', undefined, [me])).toBe('scan');
    for (const m of ['eth_getBalance', 'eth_call', 'eth_getTransactionCount', 'eth_sendRawTransaction', 'eth_getTransactionReceipt', 'eth_estimateGas', 'eth_somethingNew']) {
      expect(roleForRequest(m, undefined, [me])).toBe('query');
    }
  });
  it('a getLogs naming a user address is a query', () => {
    expect(roleForRequest('eth_getLogs', { address: me.toUpperCase().replace('0X', '0x'), topics: [] }, [me])).toBe('query');
    expect(roleForRequest('eth_getLogs', { address: [me] }, [me])).toBe('query');
    expect(roleForRequest('eth_getLogs', { address: '0x' + '11'.repeat(20), topics: ['0xaa', null, topicMe] }, [me])).toBe('query');
    expect(roleForRequest('eth_getLogs', { topics: ['0xaa', ['0x' + '1'.repeat(64), topicMe]] }, [me])).toBe('query');
    expect(roleForRequest('eth_getLogs', { address: '0x' + '11'.repeat(20), topics: ['0xaa'] }, [me])).toBe('scan');
  });
  it('validates role config and reports separation', () => {
    expect(validateRpcRoles(31337, { scan: 'https://a.example', query: 'https://b.example' }).separated).toBe(true);
    expect(validateRpcRoles(31337, { scan: 'https://a.example', query: 'https://a.example/' }).separated).toBe(false);
    expect(() => validateRpcRoles(1, { scan: 'https://a.example', query: 'https://b.example' })).toThrow(MetadataHardeningError);
    expect(() => validateRpcRoles(31337, { scan: 'http://a.example', query: 'https://b.example' })).toThrow(MetadataHardeningError);
    expect(() => validateRpcRoles(31337, { scan: 'https://a.example/?key=1', query: 'https://b.example' })).toThrow(MetadataHardeningError);
  });
});
