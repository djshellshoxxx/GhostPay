import { describe, expect, it } from 'vitest';
import { createIndexerSource } from './indexer.js';
import { fakeIndexer, fakeSecond, headOf, rawAnn } from './testutil.js';
import type { Head } from './types.js';

// What anyone can post to the announcer is no announcement here, but a caller with its own on-chain check needs it to
// count it as an RPC read would: it is returned apart, under the same block checks, once per log. All data synthetic.

const REQ = { chainId: 31337, fromBlock: 1200n, toBlock: 1700n } as const;
const fetch = (extraRaw: unknown[], head: Head = headOf()) =>
  createIndexerSource({ chainId: 31337, baseUrl: 'https://i.example.org', transport: fakeIndexer({ extraRaw }), secondSource: fakeSecond(head) }).fetch(REQ);

const emptyKey: Record<string, unknown> = { ...rawAnn(1300, 9), ephemeralPublicKey: '0x' };
const longMetadata: Record<string, unknown> = { ...rawAnn(1290, 9), metadata: `0x${'AB'.repeat(4097)}` };

describe('indexer records anyone can post', () => {
  it('are absent from a clean answer', async () => {
    expect((await fetch([])).posted).toBeUndefined();
  });

  it('are returned apart, in chain order, with their own bytes', async () => {
    const r = await fetch([emptyKey, longMetadata]);
    expect(r.posted?.map((a) => [a.blockNumber, a.logIndex, a.ephemeralPublicKey, a.metadata.length])).toEqual([
      [1290n, 9, longMetadata['ephemeralPublicKey'], 2 + 2 * 4097],
      [1300n, 9, '0x', 4],
    ]);
    expect(r.posted?.[0]?.metadata).toBe(`0x${'ab'.repeat(4097)}`);
    expect(r.posted?.[1]?.id).toBe(`${String(emptyKey['blockHash'])}:9`);
    expect(r.announcements).toEqual((await fetch([])).announcements);
    expect(r.rejected).toBeUndefined();
    expect(r.skipped).toBe(2);
  });

  it('appear once however often they are copied', async () => {
    const r = await fetch([emptyKey, { ...emptyKey }]);
    expect(r.posted).toHaveLength(1);
    expect(r.rejected).toBeUndefined();
  });

  it.each([
    ['another record for one log', [emptyKey, { ...emptyKey, metadata: '0x' }]],
    ['junk for the log of an announcement', [{ ...rawAnn(1500, 1), metadata: '0x' }]],
    ['an announcement after junk for its log', [{ ...rawAnn(1300, 9), metadata: '0x' }, rawAnn(1300, 9)]],
  ])('are refused with %s', async (_name, records) => {
    expect((await fetch(records)).rejected).toBe(1);
  });

  it('are left out under a contradicting block hash, outside the window and beyond the head', async () => {
    expect((await fetch([{ ...emptyKey, blockHash: `0x${'11'.repeat(32)}` }])).posted).toBeUndefined();
    expect((await fetch([{ ...rawAnn(2500, 9), metadata: '0x' }])).posted).toBeUndefined();
    expect((await fetch([{ ...rawAnn(1600, 9), metadata: '0x' }], headOf(1500n))).posted).toBeUndefined();
  });
});
