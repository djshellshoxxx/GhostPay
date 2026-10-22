/**
 * Committed fixtures verify against committed vkeys (runs without circom or zkeys: SP-CIR-8).
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as snarkjs from 'snarkjs';
import { describe, expect, it } from 'vitest';
import { HAVE_VKEY, PKG, art, loadJson } from './circuit.testutil.js';

interface Fixture {
  kind: 'withdraw' | 'ragequit';
  pA: [string, string];
  pB: [[string, string], [string, string]];
  pC: [string, string];
  pubSignals: string[];
}

const dir = join(PKG, 'fixtures');
const files = readdirSync(dir).filter((f) => f.endsWith('.json'));

describe.skipIf(!HAVE_VKEY || files.length === 0)('committed proof fixtures', () => {
  for (const f of files) {
    it(`${f} verifies; tampered copy does not`, async () => {
      const fx = loadJson<Fixture>(join(dir, f));
      const vk = loadJson(fx.kind === 'withdraw' ? art.withdrawVkey : art.ragequitVkey);
      const proof = {
        pi_a: [...fx.pA, '1'],
        pi_b: [
          [fx.pB[0][1], fx.pB[0][0]],
          [fx.pB[1][1], fx.pB[1][0]],
          ['1', '0'],
        ],
        pi_c: [...fx.pC, '1'],
        protocol: 'groth16',
        curve: 'bn128',
      };
      expect(await snarkjs.groth16.verify(vk, fx.pubSignals, proof)).toBe(true);
      const bad = [...fx.pubSignals];
      bad[0] = (BigInt(bad[0] as string) + 1n).toString();
      expect(await snarkjs.groth16.verify(vk, bad, proof)).toBe(false);
    });
  }
});
