import { describe, expect, it } from 'vitest';
import { PoolSdkError } from './errors.js';
import { commitment, deriveNoteSecrets, noteCommitment, nullifierHash, precommitment } from './notes.js';
import { recoverNotes } from './recover.js';
import { SyncedPool, assertRootMatches, syncPool, viemPoolRpc, type PoolEvt } from './sync.js';
import { A1, POOL, dep, fakeRpc, foreignDeposit, synced, wd, withOther, withSeed } from './fixtures.testutil.js';
import { estimatePoolCrowd } from './crowd.js';

describe('syncPool', () => {
  it('builds the tree in chain order and chunks ranges', async () => {
    const evts: PoolEvt[] = [foreignDeposit(1, 3n), dep(withSeed, 0, 1000n, 77n, 2n), foreignDeposit(2, 5n), wd(1n, 1n, 4242n, 9n)];
    const rpc = fakeRpc(evts, 10n);
    const s = await syncPool(rpc, POOL, 1n, { maxRange: 4n });
    expect(rpc.calls).toBe(3);
    expect(s.tree.size).toBe(4);
    expect(s.tree.leaf(0)).toBe(evts[1] && (evts[1] as { commitment: bigint }).commitment);
    expect(s.tree.leaf(3)).toBe(4242n);
    expect(s.lastBlock).toBe(10n);
    expect(s.deposits.length).toBe(3);
    expect(s.withdrawals.length).toBe(1);
    expect(s.ragequits.length).toBe(0);
    await expect(assertRootMatches(rpc, s)).resolves.toBeUndefined();
    await expect(assertRootMatches(fakeRpc(evts, 10n, 31337, () => false), s)).rejects.toMatchObject({ code: 'ROOT_MISMATCH' });
  });
  it('resumes incrementally and handles a reorg by re-fetching', async () => {
    const e1 = dep(withSeed, 0, 1000n, 77n, 2n);
    const e2 = foreignDeposit(1, 6n);
    const s = await syncPool(fakeRpc([e1, e2], 6n), POOL, 1n);
    expect(s.tree.size).toBe(2);
    // chain reorged: block 6 event replaced
    const e2b = foreignDeposit(9, 6n);
    const s2 = await syncPool(fakeRpc([e1, e2b], 8n), POOL, 1n, { prior: s, reorgDepth: 3n });
    expect(s2.tree.size).toBe(2);
    expect(s2.tree.leaf(1)).toBe(e2b.commitment);
    // deep rollback below block 1
    const s3 = await syncPool(fakeRpc([e1], 8n), POOL, 1n, { prior: s2, reorgDepth: 100n });
    expect(s3.tree.size).toBe(1);
    // no prior depth: incremental only
    const s4 = await syncPool(fakeRpc([e1, e2b], 9n), POOL, 1n, { prior: s3 });
    expect(s4.tree.size).toBe(1);
  });
  it('rejects wrong chain, other pool, bad range', async () => {
    await expect(syncPool(fakeRpc([], 1n, 1), POOL, 1n)).rejects.toMatchObject({ code: 'WRONG_CHAIN' });
    const s = await syncPool(fakeRpc([], 1n), POOL, 1n);
    await expect(syncPool(fakeRpc([], 1n), '0x1000000000000000000000000000000000000002', 1n, { prior: s })).rejects.toThrow(/another pool/);
    await expect(syncPool(fakeRpc([], 1n), POOL, 1n, { maxRange: 0n })).rejects.toThrow(/maxRange/);
  });
  it('append refuses events at or below the synced block', () => {
    const s = synced([foreignDeposit(1, 3n)], 3n);
    expect(() => s.append([foreignDeposit(2, 3n)], 4n)).toThrow(/below/);
    expect(new SyncedPool(31337, POOL, 5n).lastBlock).toBe(4n);
  });
  it('isSpent / leafIndexOf', () => {
    const s = synced([foreignDeposit(1, 3n), wd(55n, 1n, 9n, 4n)], 4n);
    expect(s.isSpent(55n)).toBe(true);
    expect(s.isSpent(56n)).toBe(false);
    expect(s.leafIndexOf(9n)).toBe(1);
  });
});

describe('viemPoolRpc', () => {
  it('maps logs', async () => {
    const tx = `0x${'cd'.repeat(32)}` as const;
    const client = {
      getChainId: () => Promise.resolve(31337),
      getBlockNumber: () => Promise.resolve(5n),
      getLogs: () =>
        Promise.resolve([
          { eventName: 'Deposited', blockNumber: 1n, logIndex: 0, transactionHash: tx, args: { depositor: A1, commitment: 1n, label: 2n, value: 3n, precommitment: 4n } },
          { eventName: 'Withdrawn', blockNumber: 2n, logIndex: 1, transactionHash: tx, args: { recipient: A1, value: 3n, relayerFee: 0n, spentNullifier: 8n, newCommitment: 9n, aspPublisher: A1, aspRoot: 0n } },
          { eventName: 'Ragequit', blockNumber: 3n, logIndex: 2, transactionHash: tx, args: { depositor: A1, commitment: 1n, label: 2n, value: 3n } },
        ]),
      readContract: () => Promise.resolve(true),
    };
    const rpc = viemPoolRpc(client as never);
    expect(await rpc.getChainId()).toBe(31337);
    expect(await rpc.getBlockNumber()).toBe(5n);
    const ev = await rpc.getPoolEvents({ pool: POOL, fromBlock: 0n, toBlock: 5n });
    expect(ev.map((e) => e.kind)).toEqual(['deposit', 'withdraw', 'ragequit']);
    expect(await rpc.isKnownRoot(POOL, 1n)).toBe(true);
  });
});

describe('recoverNotes', () => {
  it('recovers deposits and change chains after wiping local state', () => {
    const d0 = dep(withSeed, 0, 1000n, 77n, 2n);
    const n0 = deriveNoteSecrets(withSeed, 31337, POOL, 0);
    // partial withdrawal of 300 -> change note index 1 (value 700)
    const pre1 = precommitment(deriveNoteSecrets(withSeed, 31337, POOL, 1));
    const change1 = commitment(700n, 77n, pre1);
    // second withdrawal of the change note, full (700) -> zero-value change at index 2
    const n1 = deriveNoteSecrets(withSeed, 31337, POOL, 1);
    const pre2 = precommitment(deriveNoteSecrets(withSeed, 31337, POOL, 2));
    const change2 = commitment(0n, 77n, pre2);
    const d3 = dep(withSeed, 3, 50n, 88n, 7n);
    const rq = { kind: 'ragequit' as const, blockNumber: 8n, logIndex: 0, txHash: d3.txHash, depositor: A1, commitment: d3.commitment, label: 88n, value: 50n };
    const s = synced([foreignDeposit(1, 1n), d0, wd(nullifierHash(n0.nullifier), 300n, change1, 4n), wd(nullifierHash(n1.nullifier), 700n, change2, 5n), d3, rq, dep(withOther, 0, 5n, 1n, 6n)], 9n);
    const r = recoverNotes(withSeed, s, 10);
    expect(r.notes.map((n) => [n.index, n.value, n.spent])).toEqual([
      [0, 1000n, true],
      [3, 50n, true],
      [1, 700n, true],
    ]);
    expect(r.nextIndex).toBe(4);
    expect(r.notes[0]?.leafIndex).toBe(1);
    expect(noteCommitment(r.notes[2] as never)).toBe(change1);
    expect(recoverNotes(withOther, s, 10).notes.length).toBe(1);
  });
  it('unspent note, empty chain, bad arg', () => {
    const d0 = dep(withSeed, 0, 10n, 5n, 2n);
    const r = recoverNotes(withSeed, synced([d0], 2n), 3);
    expect(r.notes[0]?.spent).toBe(false);
    expect(recoverNotes(withSeed, synced([], 1n), 3)).toEqual({ notes: [], nextIndex: 0 });
    expect(() => recoverNotes(withSeed, synced([], 1n), 0)).toThrow(PoolSdkError);
  });
  it('withdrawal larger than note is ignored; change not derivable stays unfound', () => {
    const d0 = dep(withSeed, 0, 10n, 5n, 2n);
    const n0 = deriveNoteSecrets(withSeed, 31337, POOL, 0);
    const s1 = synced([d0, wd(nullifierHash(n0.nullifier), 11n, 5n, 3n)], 3n);
    expect(recoverNotes(withSeed, s1, 3).notes.length).toBe(1);
    const s2 = synced([d0, wd(nullifierHash(n0.nullifier), 4n, 5n, 3n)], 3n);
    expect(recoverNotes(withSeed, s2, 3).notes.length).toBe(1);
  });
});

describe('crowd', () => {
  it('counts deposits in the window with enough value', () => {
    const evts: PoolEvt[] = [];
    for (let i = 0; i < 12; i++) evts.push(foreignDeposit(i, BigInt(100 + i)));
    evts.push(foreignDeposit(99, 10n));
    const s = synced(evts, 120n);
    expect(estimatePoolCrowd(s, 100n, 12 * 200).deposits).toBe(13);
    expect(estimatePoolCrowd(s, 100n, 12 * 30).deposits).toBe(12);
    expect(estimatePoolCrowd(s, 101n, 12 * 30).label).toBe('none');
    expect(estimatePoolCrowd(synced([foreignDeposit(1, 5n)], 6n), 1n, 100, { blockTimeSec: 1 }).label).toBe('tiny');
    expect(estimatePoolCrowd(s, 100n, 12 * 100).label).toBe('small');
    const big: PoolEvt[] = [];
    for (let i = 0; i < 60; i++) big.push(foreignDeposit(i, 5n));
    expect(estimatePoolCrowd(synced(big, 6n), 1n, 600).label).toBe('larger');
    expect(estimatePoolCrowd(s, 1n, -5).deposits).toBe(0);
  });
});
