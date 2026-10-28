import { describe, expect, it } from 'vitest';
import { ChainAdapterError } from './errors.js';
import { validateAnnouncementLog, ANNOUNCEMENT_TOPIC, type ScannedAnnouncement } from './logs.js';
import type { LogFilter, RpcClient, RpcLog } from './rpc.js';
import { compareProviders, verifyReceipt, type ReceiptClaim } from './scanVerify.js';
import { FAKE, SEPOLIA } from './fixtures.testutil.js';
import { encodeAbiParameters } from 'viem/utils';
import { secp256k1 } from '@noble/curves/secp256k1.js';

const STEALTH = '0x00000000000000000000000000000000000000aa' as const;
const TOKEN = '0x00000000000000000000000000000000000000bb' as const;
const OTHER = '0x00000000000000000000000000000000000000ee' as const;
const depth = BigInt(SEPOLIA.finalityDepth);
const claim = (o: Partial<ReceiptClaim> = {}): ReceiptClaim => ({ stealthAddress: STEALTH, native: true, token: TOKEN, amount: 100n, blockNumber: 1000n, viaRouter: false, ...o });

function rpc(head: bigint, balances: Record<string, bigint>, fail = false): RpcClient {
  return {
    chainId: SEPOLIA.chainId,
    blockNumber: () => Promise.resolve(head),
    request: (m: string, p: readonly unknown[]) => {
      if (fail) return Promise.reject(new Error('x'));
      const block = m === 'eth_call' ? (p[1] as string) : (p[1] as string);
      const v = balances[BigInt(block).toString()] ?? 0n;
      return Promise.resolve(`0x${v.toString(16)}`);
    },
  } as unknown as RpcClient;
}

describe('verifyReceipt', () => {
  it('direct announcement with no funds is only "claimed" (fake receipt)', async () => {
    expect(await verifyReceipt(rpc(2000n, {}), SEPOLIA, claim())).toBe('claimed');
  });
  it('pre-existing balance never proves a direct announcement (native and ERC-20)', async () => {
    expect(await verifyReceipt(rpc(2000n, { '1000': 100n }), SEPOLIA, claim())).toBe('claimed');
    expect(await verifyReceipt(rpc(2000n, { '1000': 100n }), SEPOLIA, claim({ native: false }))).toBe('claimed');
  });
  it('underfunded claim (balance < announced amount) stays claimed', async () => {
    expect(await verifyReceipt(rpc(2000n, { '1000': 99n }), SEPOLIA, claim())).toBe('claimed');
  });
  it('old or later funds cannot turn a replayed direct announcement into a receipt', async () => {
    expect(await verifyReceipt(rpc(5000n, { '1000': 100n, [String(5000n - depth)]: 0n }), SEPOLIA, claim())).toBe('claimed');
    expect(await verifyReceipt(rpc(5000n, { [String(5000n - depth)]: 100n }), SEPOLIA, claim())).toBe('claimed');
  });
  it('is pending until finalityDepth blocks deep, even for router payments and funded ones', async () => {
    expect(await verifyReceipt(rpc(1000n + depth - 1n, { '1000': 100n }), SEPOLIA, claim())).toBe('pending');
    expect(await verifyReceipt(rpc(1000n + depth - 1n, {}), SEPOLIA, claim({ viaRouter: true }))).toBe('pending');
    expect(await verifyReceipt(rpc(1000n + depth, {}), SEPOLIA, claim({ viaRouter: true }))).toBe('verified');
  });
  it('RPC failure or garbage degrades to claimed, never verified', async () => {
    expect(await verifyReceipt(rpc(2000n, {}, true), SEPOLIA, claim())).toBe('claimed');
    const garbage = { chainId: 1, blockNumber: () => Promise.resolve(2000n), request: () => Promise.resolve({ x: 1 }) } as unknown as RpcClient;
    expect(await verifyReceipt(garbage, SEPOLIA, claim())).toBe('claimed');
  });
});

describe('compareProviders', () => {
  const eph = `0x${Array.from(secp256k1.getPublicKey(secp256k1.utils.randomSecretKey(), true), (x) => x.toString(16).padStart(2, '0')).join('')}` as const;
  const md = `0x${'12'.repeat(4)}` as const;
  const word = (a: string): string => `0x${a.slice(2).toLowerCase().padStart(64, '0')}`;
  const mkLog = (block: number, idx: number, over: Partial<RpcLog> = {}): RpcLog => ({
    address: FAKE.announcer, topics: [ANNOUNCEMENT_TOPIC, word('0x1'), word(STEALTH), word(FAKE.router)],
    data: encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], [eph, md]),
    blockNumber: `0x${block.toString(16)}`, blockHash: `0x${block.toString(16).padStart(64, '0')}`, logIndex: `0x${idx.toString(16)}`, ...over,
  });
  const parse = (l: RpcLog): ScannedAnnouncement => validateAnnouncementLog(l, FAKE.announcer, 1n, 0n, 10_000n) as ScannedAnnouncement;
  const secondary = (logs: RpcLog[], head = 500n, hashAt = (n: bigint) => `0x${n.toString(16).padStart(64, '0')}`): RpcClient => ({
    chainId: SEPOLIA.chainId,
    blockNumber: () => Promise.resolve(head),
    getBlock: (n: bigint) => Promise.resolve({ number: n, hash: hashAt(n), parentHash: hashAt(n - 1n) }),
    getLogs: (f: LogFilter) => Promise.resolve(logs.filter((l) => BigInt(l.blockNumber) >= f.fromBlock && BigInt(l.blockNumber) <= f.toBlock && (f.topics[3] == null || l.topics[3] === f.topics[3]))),
  } as unknown as RpcClient);
  const run = (sec: RpcClient, primary: RpcLog[], extra: { primarySkipped?: number; router?: `0x${string}`; primaryRouterOnlyBlocks?: bigint[] } = {}) =>
    compareProviders({ chain: SEPOLIA, secondary: sec, announcer: FAKE.announcer, fromBlock: 0n, toBlock: 300n, primaryAnnouncements: primary.map(parse), primarySkipped: extra.primarySkipped ?? 0, primaryBlockHash: `0x${(300).toString(16).padStart(64, '0')}`, ...extra });
  const spam = (block: number, idx: number): RpcLog => mkLog(block, idx, { topics: [ANNOUNCEMENT_TOPIC, word('0x1'), word(STEALTH), word(OTHER)] });
  const tooBig = (): Error => new ChainAdapterError('RESPONSE_TOO_LARGE', 'response exceeds cap');
  /** A secondary whose eth_getLogs fails for ranges wider than `maxBlocks` and for any unfiltered query covering `dense`. */
  const limited = (inner: RpcClient, maxBlocks: bigint, err: () => Error = tooBig, dense?: bigint): RpcClient => ({
    ...inner,
    getLogs: (f: LogFilter) => (f.toBlock - f.fromBlock + 1n > maxBlocks || (dense !== undefined && f.topics[3] == null && f.fromBlock <= dense && f.toBlock >= dense)
      ? Promise.reject(err())
      : inner.getLogs(f)),
  });

  it('agreeing providers produce no discrepancy', async () => {
    const logs = [mkLog(100, 0), mkLog(250, 1)];
    expect((await run(secondary(logs), logs)).discrepancies).toEqual([]);
  });
  it('detects a log the primary hid (censoring RPC)', async () => {
    const r = await run(secondary([mkLog(100, 0), mkLog(250, 1)]), [mkLog(100, 0)]);
    expect(r.discrepancies).toEqual([{ kind: 'missing_in_primary', ref: mkLog(250, 1).blockHash + ':1' }]);
  });
  it('detects a log the primary invented (fake announcement)', async () => {
    const r = await run(secondary([]), [mkLog(100, 0)]);
    expect(r.discrepancies.map((d) => d.kind)).toEqual(['missing_in_secondary']);
  });
  it('detects altered content and differing block hash', async () => {
    const altered = mkLog(100, 0, { data: encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], [eph, '0x99999999']) });
    expect((await run(secondary([altered]), [mkLog(100, 0)])).discrepancies.map((d) => d.kind)).toEqual(['content_differs']);
    const r = await run(secondary([], 500n, (n) => `0x${(n + 7n).toString(16).padStart(64, '0')}`), []);
    expect(r.discrepancies.map((d) => d.kind)).toEqual(['block_hash_differs']);
  });
  it('detects differing skipped (malformed) counts', async () => {
    const junk = mkLog(100, 0, { topics: [ANNOUNCEMENT_TOPIC, word('0x1')] });
    expect((await run(secondary([junk]), [])).discrepancies.map((d) => d.kind)).toEqual(['skipped_count_differs']);
  });
  it('halves the secondary range on a response or provider result limit instead of failing (L3-F2)', async () => {
    const logs = [mkLog(100, 0), mkLog(250, 1)];
    for (const err of [tooBig, () => new ChainAdapterError('RPC_FAILURE', 'json-rpc error -32005'), () => new ChainAdapterError('RPC_FAILURE', 'json-rpc error -32602')]) {
      expect((await run(limited(secondary(logs), 40n, err), logs)).discrepancies).toEqual([]);
    }
    // A hidden router log is still caught after splitting.
    const hidden = await run(limited(secondary(logs), 40n), [mkLog(100, 0)]);
    expect(hidden.discrepancies).toEqual([{ kind: 'missing_in_primary', ref: `${mkLog(250, 1).blockHash}:1` }]);
  });
  it('compares only the router lane of a block the primary fetched router-only, asking the secondary the same way', async () => {
    const routed = mkLog(120, 5);
    const sec = secondary([spam(120, 0), spam(120, 1), routed, mkLog(250, 1)]);
    const filters: LogFilter[] = [];
    const watched: RpcClient = { ...sec, getLogs: (f: LogFilter) => { filters.push(f); return sec.getLogs(f); } };
    const r = await run(watched, [routed, mkLog(250, 1)], { router: FAKE.router, primaryRouterOnlyBlocks: [120n] });
    expect(r.discrepancies).toEqual([]);
    expect(filters.filter((f) => f.topics.length === 4).map((f) => [f.fromBlock, f.toBlock])).toEqual([[120n, 120n]]);
    expect(filters.every((f) => f.topics.length === 4 || f.toBlock < 120n || f.fromBlock > 120n)).toBe(true);
    // Router-only blocks cannot be compared without knowing the router.
    expect((await run(sec, [routed, mkLog(250, 1)], { primaryRouterOnlyBlocks: [120n] })).discrepancies.map((d) => d.kind)).toEqual(['secondary_error']);
    // The router lane is still compared there: a router log the primary lacks is reported.
    expect((await run(sec, [mkLog(250, 1)], { router: FAKE.router, primaryRouterOnlyBlocks: [120n] })).discrepancies.map((d) => d.kind)).toEqual(['missing_in_primary']);
  });
  it('compares the router lane of a block only the secondary cannot return in one response (L3-F2)', async () => {
    const routed = mkLog(120, 5);
    const junk = mkLog(120, 2, { topics: [ANNOUNCEMENT_TOPIC, word('0x1')] });
    const primary = [spam(120, 0), routed, mkLog(250, 1)];
    const sec = limited(secondary([...primary, junk]), 1000n, tooBig, 120n);
    expect((await run(sec, primary, { router: FAKE.router, primarySkipped: 1 })).discrepancies).toEqual([]);
    // Without the router the block cannot be compared at all: fail closed.
    expect((await run(sec, primary, { primarySkipped: 1 })).discrepancies.map((d) => d.kind)).toEqual(['secondary_error']);
    // Other provider errors at one block are not treated as size limits.
    const failing = limited(secondary(primary), 1000n, () => new ChainAdapterError('RPC_FAILURE', 'json-rpc error -32603'), 120n);
    expect((await run(failing, primary, { router: FAKE.router })).discrepancies.map((d) => d.kind)).toEqual(['secondary_error']);
  });
  it('reports a secondary that answers the router-only query with another caller', async () => {
    const sec = secondary([mkLog(120, 5)]);
    const forging: RpcClient = { ...sec, getLogs: (f: LogFilter) => (f.topics.length === 4 ? Promise.resolve([spam(120, 0)]) : sec.getLogs(f)) };
    expect((await run(forging, [mkLog(120, 5)], { router: FAKE.router, primaryRouterOnlyBlocks: [120n] })).discrepancies.map((d) => d.kind)).toEqual(['secondary_error']);
  });
  it('reports lagging and failing secondaries instead of throwing', async () => {
    expect((await run(secondary([], 10n), [])).discrepancies.map((d) => d.kind)).toEqual(['secondary_behind']);
    const dead = { chainId: SEPOLIA.chainId, blockNumber: () => Promise.reject(new Error('x')) } as unknown as RpcClient;
    expect((await run(dead, [])).discrepancies.map((d) => d.kind)).toEqual(['secondary_error']);
    const other = { ...secondary([]), chainId: 1 } as RpcClient;
    expect((await run(other, [])).discrepancies.map((d) => d.kind)).toEqual(['secondary_error']);
  });
});

describe('receipt claim boundaries', () => {
  it('never verifies a router claim through a client on another chain', async () => {
    const wrong = { ...rpc(5000n, {}), chainId: 1 };
    expect(await verifyReceipt(wrong, SEPOLIA, claim({ viaRouter: true }))).toBe('claimed');
  });
  it('never verifies nonpositive amounts or negative block positions', async () => {
    for (const change of [{ amount: 0n }, { amount: -1n }, { blockNumber: -1n }]) {
      expect(await verifyReceipt(rpc(5000n, {}), SEPOLIA, claim({ viaRouter: true, ...change }))).toBe('claimed');
    }
  });
});
