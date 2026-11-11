import { buildErc20Metadata, checkAnnouncement, deriveStealthPayment, encodeMetaAddress, generateKeySet, parseCompressedPoint, type PublicAnnouncement } from '@ghostpay/core-crypto';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { describe, expect, it } from 'vitest';

/*
 * Spec 05 D2: the per-announcement cost of the ECDH shared-secret step against the tag compare and the address derivation a
 * tag mismatch skips, measured through core-crypto's public API only. EIP-5564 defines the view tag as the first byte of
 * keccak256 of the ECDH shared secret, so a tag check can never precede the ECDH; the only curve work a tag mismatch saves
 * is the stealth-address derivation (P_spend + h*G). The numbers are printed for the spec (development container, not a
 * reference machine) and the assertions pin only what the claim depends on. Runs without coverage so instrumentation does
 * not distort the ratio.
 */
const N = 200;
const hex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const TOKEN = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

function perOp(fn: (i: number) => unknown): number {
  for (let i = 0; i < 10; i++) fn(i);
  const t0 = performance.now();
  for (let i = 0; i < N; i++) fn(i);
  return ((performance.now() - t0) / N) * 1000;
}

describe('spec 05 cost benchmark (ECDH vs tag compare vs address derivation)', () => {
  it('the tag compare cannot be the first filter: the ECDH it depends on dominates, the derivation it skips is a fraction', () => {
    const keys = generateKeySet();
    const mine = encodeMetaAddress(keys);
    const matching: PublicAnnouncement[] = [];
    const wrongTag: PublicAnnouncement[] = [];
    const points: Uint8Array[] = [];
    for (let i = 0; i < N; i++) {
      const p = deriveStealthPayment(mine);
      points.push(p.ephemeralPublicKey);
      const eph = `0x${hex(p.ephemeralPublicKey)}`;
      matching.push({ schemeId: 1n, stealthAddress: p.stealthAddress, ephemeralPublicKey: eph, metadata: `0x${hex(buildErc20Metadata(p.viewTag, TOKEN, 1n))}` });
      wrongTag.push({ schemeId: 1n, stealthAddress: p.stealthAddress, ephemeralPublicKey: eph, metadata: `0x${hex(buildErc20Metadata(p.viewTag[0]! ^ 0x5a, TOKEN, 1n))}` });
    }
    const decode = perOp((i) => parseCompressedPoint(points[i]!));
    const tagCompare = perOp((i) => keccak_256(points[i]!)[0] === 0x5a);
    // Decode, ECDH, keccak and the tag compare; rejected before the address derivation.
    const rejectedByTag = perOp((i) => checkAnnouncement(wrongTag[i]!, keys.viewingSecret, keys.spendingPublicKey));
    // The same plus the address derivation and compare.
    const fullMatch = perOp((i) => checkAnnouncement(matching[i]!, keys.viewingSecret, keys.spendingPublicKey));
    const ecdh = rejectedByTag - decode - tagCompare;
    const derivation = fullMatch - rejectedByTag;
    const line = `spec05-bench us/op: pointDecode=${decode.toFixed(0)} tagCompare=${tagCompare.toFixed(1)} ecdh~=${ecdh.toFixed(0)} rejectedByTag=${rejectedByTag.toFixed(0)} fullMatch=${fullMatch.toFixed(0)} addressDerivationSkipped~=${derivation.toFixed(0)}`;
    process.stdout.write(`${line}\n`);
    expect(wrongTag.every((a) => !checkAnnouncement(a, keys.viewingSecret, keys.spendingPublicKey).matches)).toBe(true);
    expect(matching.every((a) => checkAnnouncement(a, keys.viewingSecret, keys.spendingPublicKey).matches)).toBe(true);
    // The ECDH the tag depends on costs far more than the compare itself, and more than the derivation a mismatch skips.
    expect(ecdh).toBeGreaterThan(tagCompare * 10);
    expect(ecdh).toBeGreaterThan(derivation);
  }, 120_000);
});
