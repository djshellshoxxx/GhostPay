// Audit B-1 (2026-11-18): pins the EIP-5564 scheme-1 key relation that user docs and the threat model rely on.
// The viewing key alone cannot spend, but viewing key + ANY one one-time private key + public chain data gives the
// master spending key. Any feature that exports one-time keys (spec 18 / requirement 3q) or shares the viewing key
// (watch-only, scanner delegation) must be documented and designed against this property.
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { describe, expect, it } from 'vitest';
import {
  CURVE_ORDER,
  deriveStealthPayment,
  deriveStealthSecret,
  encodeMetaAddress,
  generateKeySet,
  secretScalarFromBytes,
  unsafeRevealSecret,
} from './index.js';

const big = (b: Uint8Array): bigint => BigInt(`0x${bytesToHex(b)}`);
const announcement = (p: ReturnType<typeof deriveStealthPayment>) => ({
  stealthAddress: p.stealthAddress,
  ephemeralPublicKey: `0x${bytesToHex(p.ephemeralPublicKey)}` as const,
  metadata: `0x${bytesToHex(p.viewTag)}` as const,
});

describe('viewing-key boundary (audit B-1)', () => {
  it('one exported one-time key + viewing key + public R recovers the spending key and spends other payments', () => {
    const ks = generateKeySet();
    const meta = encodeMetaAddress(ks);
    const p1 = deriveStealthPayment(meta);
    const exported = unsafeRevealSecret(deriveStealthSecret(announcement(p1), ks));
    const view = unsafeRevealSecret(ks.viewingSecret);
    const h = keccak_256(secp256k1.getSharedSecret(view, p1.ephemeralPublicKey, true));
    const recovered = (((big(exported) - big(h)) % CURVE_ORDER) + CURVE_ORDER) % CURVE_ORDER;
    expect(recovered).toBe(big(unsafeRevealSecret(ks.spendingSecret)));

    const p2 = deriveStealthPayment(meta);
    const forged = { viewingSecret: ks.viewingSecret, spendingSecret: secretScalarFromBytes(hexToBytes(recovered.toString(16).padStart(64, '0'))) };
    // deriveStealthSecret re-checks the derived key against the announced address, so this proves spend authority.
    expect(unsafeRevealSecret(deriveStealthSecret(announcement(p2), forged))).toEqual(
      unsafeRevealSecret(deriveStealthSecret(announcement(p2), ks)),
    );
  });
});
