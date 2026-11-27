import { describe, expect, it } from 'vitest';
import { createIndexerSource } from './indexer.js';
import { blockHash, fakeIndexer, fakeSecond, headOf, inRange, rawAnn } from './testutil.js';
import type { Head } from './types.js';

// A record the indexer sends and the client cannot use may be a payment. Inside the requested range it is reported as
// rejected, so a caller can refuse to move past it; outside that range it is only skipped. All data synthetic.

const REQ = { chainId: 31337, fromBlock: 1200n, toBlock: 1700n } as const;
const BAD_HASH = `0x${'11'.repeat(32)}`;

const fetch = (extraRaw: unknown[], head: Head = headOf()) =>
  createIndexerSource({ chainId: 31337, baseUrl: 'https://i.example.org', transport: fakeIndexer({ extraRaw }), secondSource: fakeSecond(head) }).fetch(REQ);

describe('indexer records the client cannot use', () => {
  it('a clean answer reports none', async () => {
    const r = await fetch([]);
    expect(r.rejected ?? 0).toBe(0);
  });

  it.each([
    ['a block hash that contradicts the header', { ...rawAnn(1300, 9), blockHash: BAD_HASH }],
    ['a malformed field', { ...rawAnn(1300, 9), logIndex: '9' }],
    ['no readable block number', { junk: 1 }],
    ['a second, different record for one log', { ...rawAnn(1500, 1), metadata: '0xcdcd' }],
  ])('rejects %s in the requested range', async (_name, record) => {
    const r = await fetch([record]);
    expect(r.rejected).toBe(1);
    expect(r.skipped).toBe(1);
    expect(r.announcements.every((a) => a.blockNumber >= 1000n)).toBe(true);
  });

  it.each([
    ['an exact copy', inRange(1500n, 1500n)[0]],
    ['another scheme', { ...rawAnn(1300, 9), schemeId: '2' }],
    ['a bad record before the requested range', { ...rawAnn(1100, 9), blockHash: BAD_HASH }],
    ['a bad record after the requested range', { ...rawAnn(1800, 9), blockHash: BAD_HASH }],
  ])('only skips %s', async (_name, record) => {
    const r = await fetch([record]);
    expect(r.rejected ?? 0).toBe(0);
    expect(r.skipped).toBe(1);
  });

  it('only skips records beyond the independently observed head', async () => {
    const r = await fetch([], headOf(1500n));
    expect(r.skipped).toBe(inRange(1501n, 1999n).length);
    expect(r.skipped).toBeGreaterThan(0);
    expect(r.rejected ?? 0).toBe(0);
    expect(r.coverage.toBlock).toBe(1500n);
    expect(blockHash(1500n)).toBe(r.head.hash);
  });
});
