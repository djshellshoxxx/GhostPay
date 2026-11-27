import { ANNOUNCEMENT_TOPIC, CHAINS, type ScanCursor } from '@ghostpay/chain-adapters';
import { encodeMetaAddress, generateKeySet, unsafeRevealSecret } from '@ghostpay/core-crypto';
import { describe, expect, it } from 'vitest';
import { FAKE_ANNOUNCER, FAKE_ROUTER, fakeManifest } from '../test/fakeManifest';
import { InlineWorker } from '../test/inlineWorker';
import { mockRpc } from '../test/mockRpc';
import { createIndexerScanClient } from './scanPrivacy';
import { checkpointKeyId, runScan, type CheckpointStore } from './scanClient';

// An indexer record the client cannot use may be a payment: the scan fails instead of moving past it. Synthetic data.

const chain = CHAINS.find((c) => c.chainId === 84532)!;
const manifest = fakeManifest(84532);
const hexOf = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const blockHash = (n: number | bigint): `0x${string}` => `0x${BigInt(n).toString(16).padStart(64, '0')}`;
const SCHEME_TOPIC = `0x${'1'.padStart(64, '0')}` as const;

/** One well-formed record shape; it matches no key, so only whether it is usable matters here. */
const record = (block: number, over: Record<string, unknown> = {}): Record<string, unknown> => ({
  schemeId: '1', stealthAddress: `0x${'12'.repeat(20)}`, caller: `0x${'34'.repeat(20)}`, ephemeralPublicKey: `0x02${'56'.repeat(32)}`,
  metadata: '0xab', blockNumber: String(block), blockHash: blockHash(block), logIndex: 0, ...over,
});

function indexer(head: number, anns: readonly Record<string, unknown>[]) {
  return (url: string): Promise<Response> => {
    const u = new URL(url);
    const from = Number(u.searchParams.get('from'));
    const to = Math.min(Number(u.searchParams.get('to')), head);
    const headers = [];
    for (let n = from; n <= to; n++) headers.push({ number: String(n), hash: blockHash(n), parentHash: blockHash(n === 0 ? 0 : n - 1) });
    // Deliberately unfiltered: an indexer ahead of the RPC also returns records beyond its head.
    return Promise.resolve(new Response(JSON.stringify({ announcements: anns, headers }), { status: 200 }));
  };
}

function rpcAt(head: number) {
  return mockRpc(84532, (method, params) => {
    if (method === 'eth_blockNumber') return `0x${head.toString(16)}`;
    if (method === 'eth_getBlockByNumber') {
      const n = BigInt(params[0] as bigint);
      return n > BigInt(head) ? null : { hash: blockHash(n), parentHash: blockHash(n === 0n ? 0n : n - 1n), number: `0x${n.toString(16)}` };
    }
    if (method === 'eth_getLogs') return [];
    throw new Error(`unexpected ${method}`);
  });
}

const client = (anns: readonly Record<string, unknown>[], head = 2500) =>
  createIndexerScanClient(rpcAt(head), { chain, announcer: FAKE_ANNOUNCER, router: FAKE_ROUTER, baseUrl: 'https://indexer.example.org', fetchImpl: indexer(head, anns), windowBlocks: 1000 });
const query = { address: FAKE_ANNOUNCER, topics: [ANNOUNCEMENT_TOPIC, SCHEME_TOPIC], fromBlock: 1000n, toBlock: 1999n };

describe('indexer records the web client cannot use', () => {
  it.each([
    ['a contradicting block hash', record(1300, { blockHash: `0x${'ee'.repeat(32)}` })],
    ['a malformed log index', record(1300, { logIndex: '0' })],
  ])('fails the scan on %s and saves no checkpoint', async (_name, bad) => {
    const keys = generateKeySet();
    encodeMetaAddress(keys);
    const saved: ScanCursor[] = [];
    const checkpoints: CheckpointStore = { load: () => undefined, save: (_id, _k, c) => { saved.push(c); }, clear: () => undefined };
    await expect(runScan({
      chain, manifest, client: client([bad]), cursor: { nextBlock: 1000n }, spendingPublicKeyHex: hexOf(keys.spendingPublicKey), keyId: checkpointKeyId('02aa', '03bb'),
      viewingKey: unsafeRevealSecret(keys.viewingSecret), createWorker: () => new InlineWorker(), signal: new AbortController().signal, checkpoints, maxPages: 1,
    })).rejects.toMatchObject({ code: 'RPC_FAILURE', message: expect.stringContaining('indexer REJECTED_RECORDS') as unknown });
    expect(saved).toEqual([]);
  });

  it.each([
    ['an empty ephemeral key', { ephemeralPublicKey: '0x' }],
    ['empty metadata', { metadata: '0x' }],
    ['oversized metadata', { metadata: `0x${'ab'.repeat(4097)}` }],
    ['a scheme id beyond 64 bits', { schemeId: '18446744073709551616' }],
  ])('answers past %s, which anyone can post', async (_name, over) => {
    const logs = await client([record(1300), record(1400, over)]).getLogs(query);
    expect(logs.map((l) => Number(BigInt(l.blockNumber)))).toEqual([1300]);
  });

  it('still answers when the indexer is ahead of the RPC and the extra records lie beyond its head', async () => {
    const logs = await client([record(1300), record(1900)], 1500).getLogs({ ...query, toBlock: 1500n });
    expect(logs.map((l) => Number(BigInt(l.blockNumber)))).toEqual([1300]);
  });
});
