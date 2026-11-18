// Engines with the native Uint8Array hex methods (current browsers; Node 22 has none) take another path in
// @noble/hashes: `bytesToHex(bytes)` returns `bytes.toHex()`, and @noble/curves reads every secret key through it
// (`Fn.fromBytes` -> `bytesToNumberBE`). A throwing `SecretBytes.toHex` would break key generation, scanning and
// sweeping there while this repository's Node CI stayed green, so the guard deliberately leaves `toHex` alone (L4-I3).
// The builtins are emulated before noble is loaded: it detects them once, at module evaluation.
import { describe, expect, it } from 'vitest';

const seen: string[] = [];
const toHex = function (this: Uint8Array): string {
  seen.push(this.constructor.name);
  return Array.from(this, (b) => b.toString(16).padStart(2, '0')).join('');
};
const fromHex = (hex: string): Uint8Array => {
  if (!/^(?:[0-9a-fA-F]{2})*$/.test(hex)) throw new SyntaxError('hex');
  return Uint8Array.from(hex.match(/../g) ?? [], (h) => parseInt(h, 16));
};
const proto = Uint8Array.prototype as unknown as { toHex?: unknown };
const ctor = Uint8Array as unknown as { fromHex?: unknown };
const native = proto.toHex !== undefined;
if (!native) {
  Object.defineProperty(proto, 'toHex', { value: toHex, configurable: true, writable: true });
  Object.defineProperty(ctor, 'fromHex', { value: fromHex, configurable: true, writable: true });
}
const { bytesToHex } = await import('@noble/hashes/utils.js');
const { deriveStealthPayment, deriveStealthSecret, checkAnnouncement, encodeMetaAddress, generateKeySet, unsafeRevealSecret } = await import('./index.js');
const { seededRng } = await import('./rng.testutil.js');

describe.skipIf(native)('secrets in an engine with native Uint8Array hex methods (L4-I3)', () => {
  it('noble takes the builtin path for secret keys, and every key operation still works', () => {
    expect(bytesToHex(Uint8Array.of(0xca, 0xfe))).toBe('cafe');
    seen.length = 0;
    const keys = generateKeySet(seededRng('builtin-hex'));
    // Public keys are derived from the SecretBytes instances themselves: noble called their toHex.
    expect(seen).toContain('SecretBytes');
    const pay = deriveStealthPayment(encodeMetaAddress(keys), seededRng('builtin-hex-pay'));
    const announcement = {
      stealthAddress: pay.stealthAddress,
      ephemeralPublicKey: `0x${bytesToHex(pay.ephemeralPublicKey)}` as const,
      metadata: `0x${bytesToHex(pay.metadataPrefix)}` as const,
    };
    expect(checkAnnouncement(announcement, keys.viewingSecret, keys.spendingPublicKey).matches).toBe(true);
    const secret = deriveStealthSecret(announcement, keys);
    expect(unsafeRevealSecret(secret)).toHaveLength(32);
    // The textual and copying paths stay blocked in this engine too.
    expect(() => JSON.stringify(secret)).toThrow(/must not be serialized/);
    expect(() => secret.slice()).toThrow(/must not be serialized/);
  });
});
