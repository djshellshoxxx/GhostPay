/**
 * Checks the SDK's witness builders against the REAL compiled circuits (witness calculation only, no zkey needed):
 * constraints hold and the circuit's public outputs/inputs equal `expectedWithdrawSignals` in INTERFACE.md order.
 * Skips when `packages/pool-circuits/build` has no wasm.
 */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PoolTree, buildRagequitInputs, buildWithdrawInputs, deriveNoteSecrets, expectedWithdrawSignals, noteCommitment, type Note } from '@ghostpay/pool-sdk';
import { getAddress } from 'viem';
import { describe, expect, it } from 'vitest';

const C = resolve(dirname(fileURLToPath(import.meta.url)), '../../pool-circuits/build');
const W = join(C, 'withdraw32_js/withdraw32.wasm');
const R = join(C, 'commitment_js/commitment.wasm');
const ready = existsSync(W) && existsSync(R);
if (!ready) console.warn('[circuit.witness] SKIPPED: circuit wasm not built');

const pool = getAddress('0x1000000000000000000000000000000000000001');
const withSeed = <T,>(f: (s: Uint8Array) => T): T => f(new Uint8Array(32).fill(5));

describe.skipIf(!ready)('SDK witness vs real circuits', () => {
  it('withdraw: constraints hold and signals match for several tree shapes, ASP on and off', async () => {
    const { wtns } = await import('snarkjs');
    const s = deriveNoteSecrets(withSeed, 31337, pool, 0);
    const note: Note = { chainId: 31337, pool, index: 0, value: 1000n, label: 77n, ...s };
    const ns = deriveNoteSecrets(withSeed, 31337, pool, 1);
    for (const before of [0, 1, 2, 5, 8]) {
      const tree = new PoolTree();
      for (let i = 0; i < before; i++) tree.insert(BigInt(i + 100));
      tree.insert(noteCommitment(note));
      for (let i = 0; i < 2; i++) tree.insert(BigInt(i + 900));
      for (const asp of [undefined, { labels: [1n, 77n, 5n] }]) {
        const inputs = buildWithdrawInputs({ note, tree, ...(asp === undefined ? {} : { asp }), withdrawnValue: 400n, newNote: ns, context: 12345n });
        const out = { type: 'mem' } as const;
        await wtns.calculate({ ...inputs }, W, out);
        const w = await wtns.exportJson(out);
        expect(w.slice(1, 10).map(String)).toEqual(expectedWithdrawSignals(inputs).map(String));
      }
    }
  });
  it('ragequit: signals match', async () => {
    const { wtns } = await import('snarkjs');
    const note: Note = { chainId: 31337, pool, index: 0, value: 1000n, label: 77n, ...deriveNoteSecrets(withSeed, 31337, pool, 0) };
    const r = buildRagequitInputs(note);
    const out = { type: 'mem' } as const;
    await wtns.calculate({ ...r.inputs }, R, out);
    expect((await wtns.exportJson(out)).slice(1, 5).map(String)).toEqual(r.expectedSignals.map(String));
  });
  it('withdraw: a violated statement is rejected by the circuit', async () => {
    const { wtns } = await import('snarkjs');
    const s = deriveNoteSecrets(withSeed, 31337, pool, 0);
    const note: Note = { chainId: 31337, pool, index: 0, value: 1000n, label: 77n, ...s };
    const tree = new PoolTree();
    tree.insert(noteCommitment(note));
    const inputs = buildWithdrawInputs({ note, tree, withdrawnValue: 400n, newNote: deriveNoteSecrets(withSeed, 31337, pool, 1), context: 1n });
    await expect(wtns.calculate({ ...inputs, existingValue: '1001' }, W, { type: 'mem' })).rejects.toBeDefined();
    await expect(wtns.calculate({ ...inputs, withdrawnValue: '1001' }, W, { type: 'mem' })).rejects.toBeDefined();
    await expect(wtns.calculate({ ...inputs, newNullifier: inputs.existingNullifier }, W, { type: 'mem' })).rejects.toBeDefined();
  });
});
