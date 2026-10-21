import { describe, expect, it } from 'vitest';
import { validateAnnouncementLog, ANNOUNCEMENT_TOPIC, type ScannedAnnouncement } from './logs.js';
import type { RpcClient, RpcLog } from './rpc.js';
import { compareProviders, verifyReceipt, type ReceiptClaim } from './scanVerify.js';
import { FAKE, SEPOLIA } from './fixtures.testutil.js';
import { encodeAbiParameters } from 'viem/utils';
import { secp256k1 } from '@noble/curves/secp256k1.js';

const STEALTH = '0x00000000000000000000000000000000000000aa' as const;
const TOKEN = '0x00000000000000000000000000000000000000bb' as const;
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
  it('direct announcement backed by the balance is verified (native and ERC-20)', async () => {
    expect(await verifyReceipt(rpc(2000n, { '1000': 100n }), SEPOLIA, claim())).toBe('verified');
    expect(await verifyReceipt(rpc(2000n, { '1000': 100n }), SEPOLIA, claim({ native: false }))).toBe('verified');
  });
  it('underfunded claim (balance < announced amount) stays claimed', async () => {
    expect(await verifyReceipt(rpc(2000n, { '1000': 99n }), SEPOLIA, claim())).toBe('claimed');
  });
  it('funds swept later still verify via the announcing block; funded only after is verified at finalized head', async () => {
    expect(await verifyReceipt(rpc(5000n, { '1000': 100n, [String(5000n - depth)]: 0n }), SEPOLIA, claim())).toBe('verified');
    expect(await verifyReceipt(rpc(5000n, { [String(5000n - depth)]: 100n }), SEPOLIA, claim())).toBe('verified');
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
    getLogs: (f: { fromBlock: bigint; toBlock: bigint }) => Promise.resolve(logs.filter((l) => BigInt(l.blockNumber) >= f.fromBlock && BigInt(l.blockNumber) <= f.toBlock)),
  } as unknown as RpcClient);
  const run = (sec: RpcClient, primary: RpcLog[], extra: { primarySkipped?: number } = {}) =>
    compareProviders({ chain: SEPOLIA, secondary: sec, announcer: FAKE.announcer, fromBlock: 0n, toBlock: 300n, primaryAnnouncements: primary.map(parse), primarySkipped: extra.primarySkipped ?? 0, primaryBlockHash: `0x${(300).toString(16).padStart(64, '0')}` });

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
  it('reports lagging and failing secondaries instead of throwing', async () => {
    expect((await run(secondary([], 10n), [])).discrepancies.map((d) => d.kind)).toEqual(['secondary_behind']);
    const dead = { chainId: SEPOLIA.chainId, blockNumber: () => Promise.reject(new Error('x')) } as unknown as RpcClient;
    expect((await run(dead, [])).discrepancies.map((d) => d.kind)).toEqual(['secondary_error']);
    const other = { ...secondary([]), chainId: 1 } as RpcClient;
    expect((await run(other, [])).discrepancies.map((d) => d.kind)).toEqual(['secondary_error']);
  });
});
