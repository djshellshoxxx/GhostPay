import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import * as realSdk from '@0xbow/privacy-pools-core-sdk';

const calls: { withdraw?: unknown; commit?: unknown; verify?: unknown } = {};
vi.mock('@0xbow/privacy-pools-core-sdk', async (orig) => {
  const real = await orig<typeof realSdk>();
  class FakeSdk {
    public constructor(public circuits: { getWasm(n: string): Promise<Uint8Array>; getProvingKey(n: string): Promise<Uint8Array>; getVerificationKey(n: string): Promise<Uint8Array> }) {}
    public async proveWithdrawal(c: unknown, i: unknown): Promise<unknown> {
      await this.circuits.getWasm('withdraw');
      calls.withdraw = { c, i };
      return { proof: { pi_a: ['1', '2', '1'], pi_b: [['3', '4'], ['5', '6'], ['1', '0']], pi_c: ['7', '8', '1'] }, publicSignals: [1n, 2n] };
    }
    public async verifyWithdrawal(p: unknown): Promise<boolean> {
      await this.circuits.getVerificationKey('withdraw');
      calls.verify = p;
      return true;
    }
    public async proveCommitment(...a: unknown[]): Promise<unknown> {
      await this.circuits.getProvingKey('commitment');
      calls.commit = a;
      return { proof: { pi_a: ['1', '2'], pi_b: [['3', '4'], ['5', '6']], pi_c: ['7', '8'] }, publicSignals: [9n] };
    }
  }
  return { ...real, PrivacyPoolSDK: FakeSdk };
});

const { createSdkCrypto, treeDepth } = await import('./sdk-crypto.js');

describe('sdk glue argument mapping (SDK mocked, no artifacts)', () => {
  it('pads Merkle siblings to 32, derives depth and roots, and hashes artifacts as they load', async () => {
    const loaded: string[] = [];
    const c = await createSdkCrypto((circuit, kind) => {
      loaded.push(`${circuit}.${kind}`);
      return Promise.resolve(new TextEncoder().encode(`${circuit}.${kind}`));
    });
    const dep = c.depositSecrets(new Uint8Array(16).fill(2), 10n, 0n);
    const com = c.commitment(500n, 7n, dep.nullifier, dep.secret);
    const out = await c.proveWithdrawal({
      value: 500n, label: 7n, nullifier: dep.nullifier, secret: dep.secret, context: 99n, withdrawalAmount: 500n,
      stateLeaves: [11n, com.hash, 13n], aspLeaves: [7n, 8n], newNullifier: 5n, newSecret: 6n,
    });
    expect(out.publicSignals).toEqual(['1', '2']);
    const { i } = calls.withdraw as { i: { stateMerkleProof: { siblings: bigint[] }; aspMerkleProof: { siblings: bigint[] }; stateTreeDepth: bigint; aspTreeDepth: bigint; context: bigint; stateRoot: bigint } };
    expect(i.stateMerkleProof.siblings).toHaveLength(32);
    expect(i.aspMerkleProof.siblings).toHaveLength(32);
    expect(i.stateTreeDepth).toBe(2n);
    expect(i.aspTreeDepth).toBe(1n);
    expect(treeDepth(1)).toBe(0n);
    expect(treeDepth(4)).toBe(2n);
    expect(treeDepth(5)).toBe(3n);
    expect(i.context).toBe(99n);
    expect(await c.verifyWithdrawal(out)).toBe(true);
    const rq = await c.proveRagequit({ value: 1n, label: 2n, nullifier: 3n, secret: 4n });
    expect(rq.publicSignals).toEqual(['9']);
    expect(calls.commit).toEqual([1n, 2n, 3n, 4n]);
    const digests = await c.artifactDigests();
    expect(digests['withdraw.zkey']).toBe(createHash('sha256').update('withdraw.zkey').digest('hex'));
    expect(Object.keys(digests).sort()).toEqual(['commitment.vkey', 'commitment.wasm', 'commitment.zkey', 'withdraw.vkey', 'withdraw.wasm', 'withdraw.zkey']);
    const n = loaded.length;
    await c.artifactDigests();
    expect(loaded.length).toBe(n); // cached, each artifact is read once
  });
});
