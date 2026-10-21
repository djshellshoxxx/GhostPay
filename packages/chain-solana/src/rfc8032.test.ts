import { ed25519 } from '@noble/curves/ed25519.js';
import { bytesToHex, bytesToNumberLE, hexToBytes } from '@noble/curves/utils.js';
import { sha512 } from '@noble/hashes/sha2.js';
import { describe, expect, it } from 'vitest';
import { nodeVerifyEd25519 } from './reference.testutil.js';
import { RFC8032_VECTORS } from './rfc8032.testutil.js';
import { L, scalarFromValue } from './secret.js';
import { signExpanded, signWithScalar } from './sign.js';

/** RFC 8032 5.1.5: h = SHA-512(seed); a = clamp(h[0..32]); prefix = h[32..64]. */
function expand(seed: Uint8Array): { a: bigint; prefix: Uint8Array } {
  const h = sha512(seed);
  const head = h.slice(0, 32);
  head[0] = (head[0] as number) & 248;
  head[31] = ((head[31] as number) & 127) | 64;
  return { a: bytesToNumberLE(head) % L, prefix: h.slice(32, 64) };
}

describe('RFC 8032 section 7.1 vectors (external)', () => {
  it.each(RFC8032_VECTORS.map((v) => [v.name, v] as const))('TEST %s', (_name, v) => {
    const seed = hexToBytes(v.secretKey);
    const msg = hexToBytes(v.message);
    const pub = hexToBytes(v.publicKey);
    // Transcription cross-check with an independent implementation.
    expect(bytesToHex(ed25519.getPublicKey(seed))).toBe(v.publicKey);
    expect(bytesToHex(ed25519.sign(msg, seed))).toBe(v.signature);

    const { a, prefix } = expand(seed);
    expect(bytesToHex(ed25519.Point.BASE.multiply(a).toBytes())).toBe(v.publicKey);
    // Our raw-scalar core, fed the RFC expanded key, reproduces the RFC signature byte for byte.
    expect(bytesToHex(signExpanded(a, prefix, msg))).toBe(v.signature);

    // Production path: same scalar, GhostPay nonce prefix. Different bytes, but verifies (both modes).
    const sig = signWithScalar(scalarFromValue(a), msg, pub);
    expect(bytesToHex(sig)).not.toBe(v.signature);
    expect(ed25519.verify(sig, msg, pub)).toBe(true);
    expect(ed25519.verify(sig, msg, pub, { zip215: false })).toBe(true);
    expect(nodeVerifyEd25519(sig, msg, pub)).toBe(true);
    expect(nodeVerifyEd25519(hexToBytes(v.signature), msg, pub)).toBe(true);
    // Deterministic.
    expect(bytesToHex(signWithScalar(scalarFromValue(a), msg))).toBe(bytesToHex(sig));
  });

  it('signExpanded rejects a prefix that is not 32 bytes', () => {
    expect(() => signExpanded(1n, new Uint8Array(31), new Uint8Array(0))).toThrow(/invalid secret scalar/);
  });

  it('signWithScalar rejects a mismatching expected public key', () => {
    const pub = ed25519.Point.BASE.multiply(3n).toBytes();
    expect(() => signWithScalar(scalarFromValue(2n), new Uint8Array(1), pub)).toThrow(/does not match/);
  });

  it('signature over a tampered message does not verify', () => {
    const x = scalarFromValue(123456789n);
    const pub = ed25519.Point.BASE.multiply(123456789n).toBytes();
    const sig = signWithScalar(x, Uint8Array.of(1, 2, 3));
    expect(ed25519.verify(sig, Uint8Array.of(1, 2, 4), pub)).toBe(false);
  });
});
