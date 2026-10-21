import { CHAINS, type FetchOptions, type FetchResult } from '@ghostpay/chain-adapters';
import { encodeMetaAddress, generateKeySet, unsafeRevealSecret } from '@ghostpay/core-crypto';
import { describe, expect, it, vi } from 'vitest';
import { makeLog } from '../test/announcements';
import { FAKE_ANNOUNCER, FAKE_ROUTER, fakeManifest } from '../test/fakeManifest';
import { InlineWorker } from '../test/inlineWorker';
import { mockRpc } from '../test/mockRpc';
import { runScan, type ScanProgress, type ScanReorg } from './scanClient';

// Scripted second page: chain-adapters reports a reorg on page 2 (first page is the real implementation).
const script: { page: number; reorgAt: bigint | undefined } = { page: 0, reorgAt: undefined };
vi.mock('@ghostpay/chain-adapters', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@ghostpay/chain-adapters')>();
  return {
    ...orig,
    fetchAnnouncements: async (o: FetchOptions): Promise<FetchResult> => {
      script.page++;
      if (script.page === 1) return { ...(await orig.fetchAnnouncements(o)), truncated: true };
      if (script.page === 2 && script.reorgAt !== undefined) {
        return { announcements: [], cursor: { nextBlock: script.reorgAt }, truncated: false, skipped: 0, reorg: { rolledBackTo: script.reorgAt } };
      }
      return { announcements: [], cursor: o.cursor, truncated: false, skipped: 0 };
    },
  };
});

const chain = CHAINS.find((c) => c.chainId === 84532)!;
const hexOf = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const bh = (n: number): string => `0x${n.toString(16).padStart(64, '0')}`;

function rpcWith(logs: ReturnType<typeof makeLog>['log'][]) {
  return mockRpc(84532, (method, params) => {
    if (method === 'eth_blockNumber') return '0x400';
    if (method === 'eth_getBlockByNumber') {
      const n = Number(params[0]);
      return { hash: bh(n), parentHash: bh(n - 1), number: `0x${n.toString(16)}` };
    }
    if (method === 'eth_getLogs') {
      const f = params[0] as { fromBlock: bigint; toBlock: bigint };
      return logs.filter((l) => BigInt(l.blockNumber) >= f.fromBlock && BigInt(l.blockNumber) <= f.toBlock);
    }
    throw new Error(method);
  });
}

describe('runScan reorg handling (item 2)', () => {
  function setupRun() {
    const keys = generateKeySet();
    const meta = encodeMetaAddress(keys);
    const early = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: meta, block: 50, index: 0, caller: FAKE_ROUTER });
    const late = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: meta, block: 200, index: 0, caller: FAKE_ROUTER });
    return { keys, early, late };
  }

  it('retracts matches at or above rolledBackTo, keeps older ones, and surfaces the reorg', async () => {
    script.page = 0;
    script.reorgAt = 100n;
    const s = setupRun();
    const reorgs: ScanReorg[] = [];
    const progress: ScanProgress[] = [];
    const res = await runScan({
      chain,
      manifest: fakeManifest(84532),
      client: rpcWith([s.early.log, s.late.log]),
      cursor: { nextBlock: 0n },
      spendingPublicKeyHex: hexOf(s.keys.spendingPublicKey),
      viewingKey: unsafeRevealSecret(s.keys.viewingSecret),
      createWorker: () => new InlineWorker(),
      signal: new AbortController().signal,
      onReorg: (r) => reorgs.push(r),
      onProgress: (p) => progress.push(p),
    });
    expect(res.reorgs).toBe(1);
    expect(res.matches.map((m) => m.stealthAddress)).toEqual([s.early.stealthAddress]);
    expect(reorgs).toHaveLength(1);
    expect(reorgs[0]?.rolledBackTo).toBe(100n);
    expect(reorgs[0]?.retracted.map((m) => m.stealthAddress)).toEqual([s.late.stealthAddress]);
    expect(progress.at(-1)).toMatchObject({ matches: 1, reorgs: 1 });
  });
});
