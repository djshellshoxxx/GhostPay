import { ANNOUNCEMENT_TOPIC, CHAINS, type Address, type RpcLog, type ScanCursor } from '@ghostpay/chain-adapters';
import { encodeMetaAddress, generateKeySet, unsafeRevealSecret } from '@ghostpay/core-crypto';
import { describe, expect, it } from 'vitest';
import { FAKE_ANNOUNCER, FAKE_ROUTER, fakeManifest } from '../test/fakeManifest';
import { InlineWorker } from '../test/inlineWorker';
import { makeLog } from '../test/announcements';
import { mockRpc } from '../test/mockRpc';
import { DEFAULT_SCAN_PRIVACY, createIndexerScanClient, describeScanDisclosure } from './scanPrivacy';
import { checkpointKeyId, runScan, type CheckpointStore, type ScanProgress } from './scanClient';

// PRIV-04 / PRIV-T01 web boundary: what the app exposes when an indexer-only scan omits records. Synthetic data only.

const chain = CHAINS.find((c) => c.chainId === 84532)!;
const manifest = fakeManifest(84532);
const KEY = checkpointKeyId('02aa', '03bb');
const OTHER = '0x9999999999999999999999999999999999999999' as Address;
const hexOf = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const blockHash = (n: number | bigint): `0x${string}` => `0x${BigInt(n).toString(16).padStart(64, '0')}`;

interface IdxDoc { announcements: Record<string, unknown>[]; headers: { number: string; hash: string; parentHash: string }[] }

function annFrom(log: RpcLog): Record<string, unknown> {
  const data = log.data.slice(2);
  const ephLen = parseInt(data.slice(128, 192), 16);
  const eph = `0x${data.slice(192, 192 + ephLen * 2)}`;
  const metaOff = parseInt(data.slice(64, 128), 16) * 2;
  const metaLen = parseInt(data.slice(metaOff, metaOff + 64), 16);
  const metadata = `0x${data.slice(metaOff + 64, metaOff + 64 + metaLen * 2)}`;
  return {
    schemeId: '1', stealthAddress: `0x${log.topics[2]!.slice(26)}`, caller: `0x${log.topics[3]!.slice(26)}`, ephemeralPublicKey: eph, metadata,
    blockNumber: String(Number(BigInt(log.blockNumber))), blockHash: log.blockHash, logIndex: Number(BigInt(log.logIndex)), transactionHash: log.transactionHash,
  };
}

function indexerFetch(head: number, anns: readonly Record<string, unknown>[], tamper: (d: IdxDoc) => void = () => undefined) {
  const urls: string[] = [];
  const fetchImpl = (url: string): Promise<Response> => {
    urls.push(url);
    const u = new URL(url);
    const from = Number(u.searchParams.get('from'));
    const to = Math.min(Number(u.searchParams.get('to')), head);
    const headers = [];
    for (let n = from; n <= to; n++) headers.push({ number: String(n), hash: blockHash(n), parentHash: blockHash(n === 0 ? 0 : n - 1) });
    const doc: IdxDoc = { announcements: anns.filter((a) => Number(a['blockNumber']) >= from && Number(a['blockNumber']) <= to), headers };
    tamper(doc);
    return Promise.resolve(new Response(JSON.stringify(doc), { status: 200 }));
  };
  return { urls, fetchImpl };
}

/** RPC that serves block hashes only; announcer logs must come from the indexer, receipts and transactions do not exist. */
function rpcAt(head: number, hashOverride: (n: bigint) => `0x${string}` | undefined = () => undefined) {
  return mockRpc(84532, (method, params) => {
    if (method === 'eth_blockNumber') return `0x${head.toString(16)}`;
    if (method === 'eth_getBlockByNumber') {
      const n = BigInt(params[0] as bigint);
      return n > BigInt(head) ? null : { hash: hashOverride(n) ?? blockHash(n), parentHash: blockHash(n === 0n ? 0n : n - 1n), number: `0x${n.toString(16)}` };
    }
    if (method === 'eth_getLogs') return [];
    if (method === 'eth_getTransactionReceipt' || method === 'eth_getTransactionByHash') return null;
    throw new Error(`unexpected ${method}`);
  });
}

function setup() {
  const keys = generateKeySet();
  const meta = encodeMetaAddress(keys);
  const viaRouter = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: meta, block: 1200, index: 0, caller: FAKE_ROUTER });
  const open = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: meta, block: 1650, index: 1, caller: OTHER });
  return { keys, viaRouter, open, logs: [viaRouter.log, open.log] };
}

async function scan(s: ReturnType<typeof setup>, tamper?: (d: IdxDoc) => void, rpc = rpcAt(2500)) {
  const idx = indexerFetch(2500, s.logs.map(annFrom), tamper);
  const client = createIndexerScanClient(rpc, { chain, announcer: FAKE_ANNOUNCER, router: FAKE_ROUTER, baseUrl: 'https://indexer.example.org', fetchImpl: idx.fetchImpl, windowBlocks: 1000 });
  const saved: ScanCursor[] = [];
  const checkpoints: CheckpointStore = { load: () => undefined, save: (_id, _k, c) => { saved.push(c); }, clear: () => undefined };
  const progress: ScanProgress[] = [];
  const res = await runScan({
    chain, manifest, client, cursor: { nextBlock: 1000n }, spendingPublicKeyHex: hexOf(s.keys.spendingPublicKey), keyId: KEY,
    viewingKey: unsafeRevealSecret(s.keys.viewingSecret), createWorker: () => new InlineWorker(), signal: new AbortController().signal,
    checkpoints, onProgress: (p) => progress.push(p), maxPages: 1,
  });
  return { res, saved, progress, idx, rpc };
}

describe('indexer-only scan: omission and truncation at the web boundary (PRIV-T01, PRIV-T03)', () => {
  it('valid complete response: both payments found, none shown as verified from indexer data alone', async () => {
    const s = setup();
    const { res, progress } = await scan(s);
    expect(res.matches.map((m) => m.stealthAddress)).toEqual([s.viaRouter.stealthAddress, s.open.stealthAddress]);
    expect(res.matches.map((m) => m.receipt)).toEqual(['claimed', 'claimed']);
    expect(res.discrepancies).toEqual([]);
    expect(progress.at(-1)).toMatchObject({ matches: 2, scanned: 2 });
  });

  it('omission within genuine headers is not detected and integrity stays unverified: scan completes, nothing is promoted', async () => {
    const s = setup();
    const full = await scan(s);
    const omitted = await scan(s, (d) => { d.announcements = d.announcements.filter((a) => a['blockNumber'] !== '1200'); });
    // Not detected: no error, no discrepancy, no skipped count, same cursor advance as the complete scan.
    expect(omitted.res.matches.map((m) => m.stealthAddress)).toEqual([s.open.stealthAddress]);
    expect(omitted.res.discrepancies).toEqual([]);
    expect(omitted.progress.at(-1)?.skipped).toBe(0);
    expect(omitted.res.cursor.nextBlock).toBe(full.res.cursor.nextBlock);
    // Not promoted: whatever is found stays a claim, never 'verified' or 'pending' funds.
    expect(omitted.res.matches.every((m) => m.receipt === 'claimed')).toBe(true);
    // The only completeness signal the UI gets is the honest wording that the indexer can still omit records.
    expect(describeScanDisclosure({ ...DEFAULT_SCAN_PRIVACY, source: 'indexer' }, { hasSecondary: true }).find((r) => r.party === 'Indexer operator')?.learns).toContain('could still omit announcements');
    expect(Object.keys(omitted.progress.at(-1) ?? {}).some((k) => /complete|verified|proof/i.test(k))).toBe(false);
  });

  it('an empty announcement list hiding every valid record is likewise undetected, with no paid status', async () => {
    const s = setup();
    const { res, saved } = await scan(s, (d) => { d.announcements = []; });
    expect(res.matches).toEqual([]);
    expect(res.discrepancies).toEqual([]);
    expect(saved.length).toBeGreaterThan(0); // the checkpoint advances over the hidden records: documented limitation, not a bug fix here
  });

  it('disclosure keeps saying the indexer could omit records, and only in indexer mode', () => {
    const rows = describeScanDisclosure({ ...DEFAULT_SCAN_PRIVACY, source: 'indexer' }, { hasSecondary: false });
    expect(rows.find((r) => r.party === 'Indexer operator')?.learns).toContain('the indexer could still omit announcements inside blocks it reports');
    expect(describeScanDisclosure(DEFAULT_SCAN_PRIVACY, { hasSecondary: false }).some((r) => r.party === 'Indexer operator')).toBe(false);
  });

  const failClosed: [string, (d: IdxDoc) => void, string, (() => ReturnType<typeof rpcAt>)?][] = [
    ['missing block header', (d) => { d.headers = d.headers.filter((h) => h.number !== '1300'); }, 'CONTINUITY'],
    ['wrong parent hash', (d) => { const h = d.headers.find((x) => x.number === '1300'); if (h) h.parentHash = `0x${'ee'.repeat(32)}`; }, 'CONTINUITY'],
    ['truncated header tail (stale indexer)', (d) => { d.headers = d.headers.slice(0, 600); }, 'CONTINUITY'],
    ['headers start inside the padded window', (d) => { d.headers = d.headers.slice(100); }, 'CONTINUITY'],
    ['block hash the independent RPC does not confirm', () => undefined, 'HEAD_MISMATCH', () => rpcAt(2500, (n) => (n === 1650n ? `0x${'ee'.repeat(32)}` : undefined))],
    ['unparseable body', (d) => { (d as unknown as Record<string, unknown>)['headers'] = 'x'; }, 'BAD_RESPONSE'],
  ];
  it.each(failClosed)('fails closed on %s: scan rejects with the source code, no checkpoint is saved', async (_name, tamper, code, mkRpc) => {
    const s = setup();
    const saved: ScanCursor[] = [];
    const idx = indexerFetch(2500, s.logs.map(annFrom), tamper);
    const client = createIndexerScanClient(mkRpc?.() ?? rpcAt(2500), { chain, announcer: FAKE_ANNOUNCER, router: FAKE_ROUTER, baseUrl: 'https://indexer.example.org', fetchImpl: idx.fetchImpl, windowBlocks: 1000 });
    const checkpoints: CheckpointStore = { load: () => undefined, save: (_id, _k, c) => { saved.push(c); }, clear: () => undefined };
    await expect(runScan({
      chain, manifest, client, cursor: { nextBlock: 1000n }, spendingPublicKeyHex: hexOf(s.keys.spendingPublicKey), keyId: KEY,
      viewingKey: unsafeRevealSecret(s.keys.viewingSecret), createWorker: () => new InlineWorker(), signal: new AbortController().signal, checkpoints,
    })).rejects.toMatchObject({ code: 'RPC_FAILURE', message: expect.stringContaining(`indexer ${code}`) as unknown });
    expect(saved).toEqual([]);
  });

  // Anyone can post announcements into any number of blocks, so a dense window must not stop the scan; every one of
  // its blocks is still confirmed by the independent RPC.
  describe('a window with more than 200 announcement blocks', () => {
    const meta = encodeMetaAddress(generateKeySet());
    const blocks = Array.from({ length: 201 }, (_, i) => 1000 + 4 * i);
    const dense = (rpc: ReturnType<typeof rpcAt>, fromBlock: bigint, toBlock: bigint) => {
      const idx = indexerFetch(2500, blocks.map((block) => annFrom(makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: meta, block, index: 0, caller: OTHER }).log)));
      const client = createIndexerScanClient(rpc, { chain, announcer: FAKE_ANNOUNCER, baseUrl: 'https://indexer.example.org', fetchImpl: idx.fetchImpl, windowBlocks: 1000 });
      return { idx, logs: client.getLogs({ address: FAKE_ANNOUNCER, topics: [ANNOUNCEMENT_TOPIC, `0x${'1'.padStart(64, '0')}`], fromBlock, toBlock }) };
    };

    it.each([
      ['one grid window', 1000n, 1999n],
      ['a page that is not on the grid, so two windows are fetched', 999n, 1998n],
    ])('is read whole in one request, every block checked against the RPC (%s)', async (_name, fromBlock, toBlock) => {
      const asked = new Set<bigint>();
      const { idx, logs } = dense(rpcAt(2500, (n) => { asked.add(n); return undefined; }), fromBlock, toBlock);
      expect((await logs).map((l) => BigInt(l.blockNumber))).toEqual(blocks.map(BigInt));
      expect(blocks.filter((b) => !asked.has(BigInt(b)))).toEqual([]);
      expect(idx.urls).toHaveLength(1);
    });

    it('still fails closed when the RPC does not confirm a block past the 200th', async () => {
      const { logs } = dense(rpcAt(2500, (n) => (n === 1800n ? `0x${'ee'.repeat(32)}` : undefined)), 1000n, 1999n);
      await expect(logs).rejects.toMatchObject({ code: 'RPC_FAILURE', message: expect.stringContaining('indexer HEAD_MISMATCH') as unknown });
    });
  });

  it('RPC head below the window start: nothing is scanned, the indexer is never asked and no match appears', async () => {
    const s = setup();
    const { res, idx } = await scan(s, undefined, rpcAt(900));
    expect(res.scanned).toBe(0);
    expect(res.matches).toEqual([]);
    expect(res.cursor.nextBlock).toBe(1000n);
    expect(idx.urls).toEqual([]);
  });

  it('the source-level OUT_OF_RANGE surfaces through the client as a failed scan, not an empty success', async () => {
    const s = setup();
    const idx = indexerFetch(2500, s.logs.map(annFrom));
    const client = createIndexerScanClient(rpcAt(900), { chain, announcer: FAKE_ANNOUNCER, baseUrl: 'https://indexer.example.org', fetchImpl: idx.fetchImpl, windowBlocks: 1000 });
    await expect(client.getLogs({ address: FAKE_ANNOUNCER, topics: [ANNOUNCEMENT_TOPIC, `0x${'1'.padStart(64, '0')}`], fromBlock: 1000n, toBlock: 1999n })).rejects.toMatchObject({ code: 'RPC_FAILURE', message: expect.stringContaining('indexer OUT_OF_RANGE') as unknown });
    expect(idx.urls).toEqual([]);
  });
});
