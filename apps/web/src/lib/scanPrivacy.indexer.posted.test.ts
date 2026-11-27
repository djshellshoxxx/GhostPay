import { ANNOUNCEMENT_TOPIC, CHAINS, type LogFilter, type RpcLog, type ScanCursor } from '@ghostpay/chain-adapters';
import { generateKeySet, unsafeRevealSecret } from '@ghostpay/core-crypto';
import { encodeAbiParameters } from 'viem/utils';
import { describe, expect, it } from 'vitest';
import { FAKE_ANNOUNCER, FAKE_ROUTER, fakeManifest } from '../test/fakeManifest';
import { InlineWorker } from '../test/inlineWorker';
import { mockRpc, type MockRpc } from '../test/mockRpc';
import { createIndexerScanClient } from './scanPrivacy';
import { checkpointKeyId, runScan, type CheckpointStore } from './scanClient';

// An indexer and a second RPC read one chain. What anyone can post to the announcer must count the same on both, so it
// cannot withhold a page; a record the indexer alters or leaves out must still withhold it. Synthetic data.

const chain = CHAINS.find((c) => c.chainId === 84532)!;
const manifest = fakeManifest(84532);
const HEAD = 900;
const hexOf = (b: Uint8Array): `0x${string}` => `0x${Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')}`;
const blockHash = (n: number | bigint): `0x${string}` => `0x${BigInt(n).toString(16).padStart(64, '0')}`;
const word = (a: string): `0x${string}` => `0x${a.slice(2).padStart(64, '0')}`;
/** A point on the curve, so the on-chain content check accepts it; it matches no key of the scan. */
const POINT = hexOf(generateKeySet().viewingPublicKey);
const STEALTH = `0x${'12'.repeat(20)}` as const;
const CALLER = `0x${'34'.repeat(20)}` as const;

interface Posted { readonly block: number; readonly key: `0x${string}`; readonly metadata: `0x${string}` }
const payment: Posted = { block: 300, key: POINT, metadata: '0xab' };
const junk: readonly Posted[] = [
  { block: 400, key: '0x', metadata: '0xab' },
  { block: 450, key: `0x02${'56'.repeat(31)}`, metadata: '0xab' },
  { block: 500, key: POINT, metadata: '0x' },
  { block: 550, key: `0x05${'56'.repeat(32)}`, metadata: '0xab' },
  // Longer than the indexer record limit; the announcer and the RPC path accept it.
  { block: 600, key: POINT, metadata: `0x${'ab'.repeat(4097)}` },
];

const record = (p: Posted): Record<string, unknown> => ({
  schemeId: '1', stealthAddress: STEALTH, caller: CALLER, ephemeralPublicKey: p.key, metadata: p.metadata,
  blockNumber: String(p.block), blockHash: blockHash(p.block), logIndex: 0,
});
const log = (p: Posted): RpcLog => ({
  address: FAKE_ANNOUNCER, topics: [ANNOUNCEMENT_TOPIC, word('0x01'), word(STEALTH), word(CALLER)],
  data: encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], [p.key, p.metadata]),
  blockNumber: `0x${p.block.toString(16)}`, blockHash: blockHash(p.block), logIndex: '0x0',
});

function indexer(records: readonly Record<string, unknown>[]) {
  return (url: string): Promise<Response> => {
    const u = new URL(url);
    const from = Number(u.searchParams.get('from'));
    const to = Math.min(Number(u.searchParams.get('to')), HEAD);
    const headers = [];
    for (let n = from; n <= to; n++) headers.push({ number: String(n), hash: blockHash(n), parentHash: blockHash(n === 0 ? 0 : n - 1) });
    return Promise.resolve(new Response(JSON.stringify({ announcements: records, headers }), { status: 200 }));
  };
}

function rpc(logs: readonly RpcLog[]): MockRpc {
  return mockRpc(chain.chainId, (method, params) => {
    if (method === 'eth_blockNumber') return `0x${HEAD.toString(16)}`;
    if (method === 'eth_getBlockByNumber') {
      const n = BigInt(params[0] as bigint);
      return n > BigInt(HEAD) ? null : { hash: blockHash(n), parentHash: blockHash(n === 0n ? 0n : n - 1n), number: `0x${n.toString(16)}` };
    }
    if (method === 'eth_getLogs') {
      const f = params[0] as LogFilter;
      return logs.filter((l) => BigInt(l.blockNumber) >= f.fromBlock && BigInt(l.blockNumber) <= f.toBlock);
    }
    throw new Error(`unexpected ${method}`);
  });
}

/** A scan through the indexer, with the user's RPC as block witness and a second RPC that holds `onChain`. */
async function scan(indexed: readonly Record<string, unknown>[], onChain: readonly Posted[]) {
  const keys = generateKeySet();
  const saved: ScanCursor[] = [];
  const checkpoints: CheckpointStore = { load: () => undefined, save: (_id, _k, c) => { saved.push(c); }, clear: () => undefined };
  const client = createIndexerScanClient(rpc([]), { chain, announcer: FAKE_ANNOUNCER, router: FAKE_ROUTER, baseUrl: 'https://indexer.example.org', fetchImpl: indexer(indexed), windowBlocks: 1000 });
  const result = await runScan({
    chain, manifest, client, secondaryClient: rpc(onChain.map(log)), cursor: { nextBlock: 0n },
    spendingPublicKeyHex: hexOf(keys.spendingPublicKey), keyId: checkpointKeyId('02aa', '03bb'),
    viewingKey: unsafeRevealSecret(keys.viewingSecret).slice(), createWorker: () => new InlineWorker(), signal: new AbortController().signal, checkpoints,
  });
  return { result, saved, kinds: result.discrepancies.map((d) => d.kind) };
}

describe('an indexer scan checked against a second RPC', () => {
  it('passes what anyone can post, counted the same on both sides', async () => {
    const onChain = [payment, ...junk];
    const { result, saved, kinds } = await scan(onChain.map(record), onChain);
    expect(kinds).toEqual([]);
    // The payment and the long-metadata announcement are scanned, as they are over the RPC; the rest is skipped.
    expect(result.scanned).toBe(2);
    expect(result.cursor.nextBlock).toBe(BigInt(HEAD) + 1n);
    expect(saved.length).toBeGreaterThan(0);
  });

  it.each([
    ['empties its metadata', { metadata: '0x' }],
    ['empties its key', { ephemeralPublicKey: '0x' }],
    ['pads its metadata past the record limit', { metadata: `0x${'ab'.repeat(4097)}` }],
  ])('withholds the page when the indexer %s on a real announcement', async (_name, change) => {
    const { saved, kinds } = await scan([{ ...record(payment), ...change }], [payment]);
    expect(kinds.length).toBeGreaterThan(0);
    expect(saved).toEqual([]);
  });

  it('withholds the page when the indexer leaves an announcement out and sends junk in its place', async () => {
    const { saved, kinds } = await scan([record({ ...junk[0]!, block: 350 })], [payment]);
    expect(kinds).toContain('missing_in_primary');
    expect(saved).toEqual([]);
  });

  it('fails the fetch when the indexer sends two different records for one log', async () => {
    await expect(scan([record(payment), record({ ...payment, metadata: '0x' })], [payment]))
      .rejects.toMatchObject({ code: 'RPC_FAILURE', message: expect.stringContaining('indexer REJECTED_RECORDS') as unknown });
  });

  it('counts an exact copy of posted junk once', async () => {
    const onChain = [payment, junk[0]!];
    const { kinds } = await scan([...onChain.map(record), record(junk[0]!)], onChain);
    expect(kinds).toEqual([]);
  });
});
