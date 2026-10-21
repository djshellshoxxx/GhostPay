import { hkdfSync } from 'node:crypto';
import { bytesToHex, type Address } from 'viem';
import { privateKeyToAddress } from 'viem/accounts';
import { SecretBox, wipe } from '@ghostpay/secret-box';
import { PayerSponsorError, ensure } from '../errors.js';

/** secp256k1 group order. */
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const SALT = new TextEncoder().encode('ghostpay/payer-hiding/v1/fresh-payer');

/** A derived one-time payer key. The key lives in a {@link SecretBox}; dispose it after use. */
export interface DerivedPayer {
  readonly privateKey: SecretBox;
  readonly address: Address;
}

/**
 * Derives a one-time payer key from `(seed, invoiceId, index)` (PH-1-REQ-1): HKDF-SHA256 with a fixed
 * salt for domain separation, rejection-sampled into `[1, n-1]`. Distinct `(invoiceId, index)` give
 * distinct keys; the same inputs give the same key.
 *
 * @param seed Secret seed (at least 16 bytes). Not retained and not wiped by this function.
 * @param invoiceId Invoice identifier bytes (1..255 bytes).
 * @param index Payment index, `0 .. 2^32-1`.
 * @returns The key in a SecretBox and its address. The caller must `dispose()` the box.
 * @security Best-effort hygiene: the transient hex string used to compute the address cannot be wiped
 *   from the JS heap. A fresh payer key still needs token funding that links it to its source (N2).
 */
export function derivePayerKey(seed: Uint8Array, invoiceId: Uint8Array, index: number): DerivedPayer {
  ensure(seed.length >= 16, 'seed must be at least 16 bytes');
  ensure(invoiceId.length >= 1 && invoiceId.length <= 255, 'invoiceId must be 1..255 bytes');
  ensure(Number.isInteger(index) && index >= 0 && index <= 0xffff_ffff, 'index must be a uint32');
  for (let counter = 0; counter < 256; counter++) {
    const info = new Uint8Array(invoiceId.length + 5);
    info.set(invoiceId, 0);
    new DataView(info.buffer).setUint32(invoiceId.length, index);
    info[invoiceId.length + 4] = counter;
    const key = new Uint8Array(hkdfSync('sha256', seed, SALT, info, 32));
    let v = 0n;
    for (const b of key) v = (v << 8n) | BigInt(b);
    if (v >= 1n && v < N) {
      const address = privateKeyToAddress(bytesToHex(key));
      return { privateKey: SecretBox.copyOf(key, { label: 'payer-key', wipeSource: true }), address };
    }
    wipe(key);
  }
  throw new PayerSponsorError('INVALID_ARGUMENT', 'no valid scalar found'); // probability 2^-256
}

/**
 * Runs `fn` with a derived payer and always disposes the key afterwards (zeroed on scope exit).
 *
 * @param seed Secret seed.
 * @param invoiceId Invoice identifier bytes.
 * @param index Payment index.
 * @param fn Callback receiving the SecretBox and address; must not leak the key.
 * @returns The callback result.
 */
export async function withPayerKey<T>(
  seed: Uint8Array,
  invoiceId: Uint8Array,
  index: number,
  fn: (key: SecretBox, address: Address) => Promise<T>,
): Promise<T> {
  const d = derivePayerKey(seed, invoiceId, index);
  try {
    return await fn(d.privateKey, d.address);
  } finally {
    d.privateKey.dispose();
  }
}
