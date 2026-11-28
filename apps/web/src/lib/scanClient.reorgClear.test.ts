import { CHAINS, type Hex, type RpcLog, type ScanCursor } from '@ghostpay/chain-adapters';
import { encodeMetaAddress, generateKeySet, unsafeRevealSecret } from '@ghostpay/core-crypto';
import { describe, expect, it, vi } from 'vitest';
import { makeLog } from '../test/announcements';
import { FAKE_ANNOUNCER, FAKE_ROUTER, fakeManifest } from '../test/fakeManifest';
import { InlineWorker } from '../test/inlineWorker';
import { mockRpc } from '../test/mockRpc';
import { checkpointKeyId, runScan, type CheckpointStore } from './scanClient';

// PRIV-06 F1: a run yields the checkpoint slot once another scan of the same keys has written it. That holds for the
// rewind after a reorg too: it may remove only the cursor this run still owns. Synthetic chain only.

const small = { ...CHAINS.find((c) => c.chainId === 84532)!, getLogsMaxRange: 100, finalityDepth: 10 };
const manifest = fakeManifest(84532);
const KEY = checkpointKeyId('02aa', '03bb');
const forkHash = (n: number): Hex => `0x${(n + 5_000_000).toString(16).padStart(64, '0')}`;
const oldHash = (n: number): Hex => `0x${n.toString(16).padStart(64, '0')}`;
const cursor = (next: number, hash: (n: number) => Hex): ScanCursor => ({ nextBlock: BigInt(next), last: { number: BigInt(next - 1), hash: hash(next - 1) } });
const STALE = cursor(8001, oldHash);

/** Runs a scan that meets a reorg under `STALE` and stops on its announcement budget; `meanwhile` runs during it. */
async function heldRollback(meanwhile: (write: (c: ScanCursor) => void) => void) {
  const keys = generateKeySet();
  const meta = encodeMetaAddress(keys);
  const logs: RpcLog[] = [100, 4999].map((block) => ({ ...makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: meta, block, index: 0, caller: FAKE_ROUTER }).log, blockHash: forkHash(block) }));
  const client = mockRpc(84532, (method, params) => {
    if (method === 'eth_blockNumber') return `0x${(12_000).toString(16)}`;
    if (method === 'eth_getBlockByNumber') {
      const n = Number(params[0]);
      return { hash: forkHash(n), parentHash: forkHash(n - 1), number: `0x${n.toString(16)}` };
    }
    if (method === 'eth_getLogs') {
      const f = params[0] as { fromBlock: bigint; toBlock: bigint };
      return logs.filter((l) => BigInt(l.blockNumber) >= f.fromBlock && BigInt(l.blockNumber) <= f.toBlock);
    }
    throw new Error(`unexpected ${method}`);
  });
  let slot: ScanCursor | undefined = STALE;
  const clear = vi.fn(() => { slot = undefined; });
  const checkpoints: CheckpointStore = { load: () => slot, save: (_id, _key, c) => { slot = c; }, clear };
  const result = await runScan({
    chain: small, manifest, client, cursor: STALE, checkpoints, maxAnnouncementsPerScan: 1, keyId: KEY,
    spendingPublicKeyHex: Array.from(keys.spendingPublicKey, (x) => x.toString(16).padStart(2, '0')).join(''),
    viewingKey: unsafeRevealSecret(keys.viewingSecret).slice(), createWorker: () => new InlineWorker(), signal: new AbortController().signal,
    onReorg: () => { meanwhile((c) => { slot = c; }); },
  });
  return { result, clear, slot: () => slot };
}

describe('PRIV-06 F1: rewinding after a reorg', () => {
  it('clears the orphaned checkpoint this run still owns', async () => {
    const run = await heldRollback(() => undefined);
    expect(run.result.limitReached).toBe(true);
    expect(run.clear).toHaveBeenCalledTimes(1);
    expect(run.slot()).toBeUndefined();
  });

  it.each([
    ['a newer scan', cursor(11_000, forkHash)],
    ['another scan that rolled back further', cursor(50, forkHash)],
  ])('leaves the checkpoint written meanwhile by %s', async (_name, theirs) => {
    const run = await heldRollback((write) => { write(theirs); });
    expect(run.result.limitReached).toBe(true);
    expect(run.clear).not.toHaveBeenCalled();
    expect(run.slot()).toEqual(theirs);
  });
});
