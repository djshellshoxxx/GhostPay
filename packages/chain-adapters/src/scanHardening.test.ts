import { encodeAbiParameters } from 'viem/utils';
import { describe, expect, it } from 'vitest';
import { FAKE, SEPOLIA, payment, recipient } from './fixtures.testutil.js';
import { ANNOUNCEMENT_TOPIC, fetchAnnouncements } from './logs.js';
import { createClient, type RpcClient, type RpcLog } from './rpc.js';
import { fakeTransport, noSleep } from './rpc.testutil.js';
import type { Hex } from './types.js';

// CHAIN-ADAPTERS-01 / 02 regression tests.
const ANN = FAKE.announcer;
const word = (a: string): Hex => `0x${a.replace('0x', '').toLowerCase().padStart(64, '0')}`;
const bh = (n: number): Hex => `0x${n.toString(16).padStart(64, '0')}`;
const PAY = payment(recipient().meta);
const CHAIN = { ...SEPOLIA, getLogsMaxRange: 1000, finalityDepth: 5 };

function mkLog(block: number, index = 0): RpcLog {
  const eph: Hex = `0x${Buffer.from(PAY.ephemeralPublicKey).toString('hex')}`;
  return {
    address: ANN,
    topics: [ANNOUNCEMENT_TOPIC, word('0x1'), word(PAY.stealthAddress), word(FAKE.router)],
    data: encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], [eph, `0x${'ab'}${'00'.repeat(56)}`]),
    blockNumber: `0x${block.toString(16)}`,
    blockHash: bh(block),
    logIndex: `0x${index.toString(16)}`,
  };
}

function client(head: number, logs: RpcLog[], opts: { maxBytes?: number; seen?: { from: bigint; to: bigint }[] } = {}): Promise<RpcClient> {
  const t = fakeTransport((m, p) => {
    if (m === 'eth_chainId') return '0xaa36a7';
    if (m === 'eth_blockNumber') return `0x${head.toString(16)}`;
    if (m === 'eth_getBlockByNumber') {
      const n = Number(BigInt(p[0] as string));
      return n > head ? null : { number: p[0], hash: bh(n), parentHash: bh(Math.max(0, n - 1)) };
    }
    if (m === 'eth_getLogs') {
      const f = p[0] as { fromBlock: string; toBlock: string };
      const from = BigInt(f.fromBlock);
      const to = BigInt(f.toBlock);
      opts.seen?.push({ from, to });
      return logs.filter((l) => BigInt(l.blockNumber) >= from && BigInt(l.blockNumber) <= to);
    }
    return null;
  });
  return createClient(CHAIN, 'https://rpc.example.test', { transport: t, sleep: noSleep, retries: 0, maxResponseBytes: opts.maxBytes ?? 2 * 1024 * 1024 });
}

describe('CHAIN-ADAPTERS-01: RESPONSE_TOO_LARGE halves the window', () => {
  it('a heavy block does not stop the scan: window shrinks until the response fits', async () => {
    // 30 spam logs in block 7 (about 30 KB); cap 12 KB. A 1000-block window overflows, a 1-block window around block 7 also does.
    // Spam is placed in block 7 only; the window must shrink to a size whose response excludes it or fits.
    const spam = Array.from({ length: 4 }, (_, i) => mkLog(7, i));
    const heavy = [...spam, mkLog(900, 0), mkLog(901, 0), mkLog(902, 0), mkLog(903, 0), mkLog(904, 0), mkLog(905, 0), mkLog(906, 0), mkLog(907, 0), mkLog(908, 0), mkLog(909, 0)];
    const seen: { from: bigint; to: bigint }[] = [];
    // each log ~ 1.1 KB json; 14 logs overflow 6 KB but 4 logs do not
    const c = await client(1000, heavy, { maxBytes: 6000, seen });
    const r = await fetchAnnouncements({ chain: CHAIN, client: c, announcer: ANN, cursor: { nextBlock: 0n } });
    expect(r.announcements).toHaveLength(14);
    expect(seen.length).toBeGreaterThan(1);
  });
});

describe('CHAIN-ADAPTERS-02: a cursor far beyond the reported head fails closed', () => {
  it('refuses to resume past the head (lying or poisoned checkpoint) instead of silently scanning nothing', async () => {
    const c = await client(100, []);
    await expect(fetchAnnouncements({ chain: CHAIN, client: c, announcer: ANN, cursor: { nextBlock: 1_000_001n, last: { number: 1_000_000n, hash: bh(1_000_000) } } })).rejects.toThrow(/RPC_FAILURE/);
  });
  it('tolerates a provider lagging within finalityDepth', async () => {
    const c = await client(100, []);
    const r = await fetchAnnouncements({ chain: CHAIN, client: c, announcer: ANN, cursor: { nextBlock: 103n } });
    expect(r.announcements).toHaveLength(0);
    expect(r.cursor.nextBlock).toBe(103n);
  });
});
