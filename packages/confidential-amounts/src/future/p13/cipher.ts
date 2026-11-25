/**
 * Record sealing port and its WebCrypto adapter. AES-256-GCM, 96-bit random nonce, 128-bit tag, caller-supplied AAD:
 * the same primitive and parameters as the invoice envelope (ADR-0005) and the vault (`@ghostpay/ux-vault`).
 * The key is a non-extractable `CryptoKey` owned by the composition root; deriving and backing it up belongs to the
 * vault/recovery owner (P05), not to P13. No new primitive or construction is introduced here.
 */
import { check, fail } from './errors.js';

/** Authenticated encryption of record bytes. */
export interface RecordSealer {
  seal(aad: Uint8Array, plaintext: Uint8Array): Promise<Uint8Array>;
  /** @throws {P13Error} `P13_RECORD_AUTH` for a wrong key, wrong AAD or modified ciphertext (uniform). */
  open(aad: Uint8Array, sealed: Uint8Array): Promise<Uint8Array>;
}

/** Dependencies of {@link createAesGcmSealer}. */
export interface SealerDeps {
  readonly subtle: SubtleCrypto;
  /** Cryptographically secure bytes; production passes `crypto.getRandomValues`. */
  readonly rng: (n: number) => Uint8Array;
}

const NONCE_LEN = 12;
const TAG_LEN = 16;

function toBuffer(b: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(b.length));
  out.set(b);
  return out;
}

/** Default dependencies backed by `globalThis.crypto`. */
export function defaultSealerDeps(): SealerDeps {
  return {
    subtle: globalThis.crypto.subtle,
    rng: (n) => globalThis.crypto.getRandomValues(new Uint8Array(n)),
  };
}

/** Generates a fresh non-extractable AES-256-GCM record key (tests, or a vault that wraps it). */
export async function generateRecordKey(subtle: SubtleCrypto = globalThis.crypto.subtle): Promise<CryptoKey> {
  return subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/**
 * WebCrypto AES-256-GCM sealer. Output: nonce(12) || ciphertext || tag(16).
 * @throws {P13Error} `P13_RECORD_AUTH` when the key is not a non-extractable 256-bit AES-GCM encrypt/decrypt key.
 */
export function createAesGcmSealer(key: CryptoKey, deps: SealerDeps = defaultSealerDeps()): RecordSealer {
  const alg = key.algorithm as AesKeyAlgorithm;
  check(
    alg.name === 'AES-GCM' && alg.length === 256 && !key.extractable &&
      key.usages.includes('encrypt') && key.usages.includes('decrypt'),
    'P13_RECORD_AUTH',
    'record key must be a non-extractable AES-256-GCM key',
  );
  // Cheap guards against a broken rng (audit A10): an all-zero nonce or a repeat of the previous nonce is refused.
  // GCM nonce reuse under one key breaks confidentiality and integrity; this does not replace a sound rng.
  let previous: Uint8Array | undefined;
  return {
    async seal(aad, plaintext) {
      const nonce = Uint8Array.from(deps.rng(NONCE_LEN));
      check(nonce.length === NONCE_LEN, 'P13_INTERNAL', 'rng returned wrong length');
      check(nonce.some((b) => b !== 0), 'P13_INTERNAL', 'rng returned zeros');
      check(previous === undefined || nonce.some((b, i) => b !== previous?.[i]), 'P13_INTERNAL', 'rng repeated a nonce');
      previous = nonce;
      const ct = new Uint8Array(
        await deps.subtle.encrypt(
          { name: 'AES-GCM', iv: toBuffer(nonce), additionalData: toBuffer(aad), tagLength: TAG_LEN * 8 },
          key,
          toBuffer(plaintext),
        ),
      );
      const out = new Uint8Array(NONCE_LEN + ct.length);
      out.set(nonce, 0);
      out.set(ct, NONCE_LEN);
      return out;
    },
    async open(aad, sealed) {
      check(sealed.length >= NONCE_LEN + TAG_LEN, 'P13_RECORD_AUTH', 'record could not be opened');
      try {
        const pt = await deps.subtle.decrypt(
          { name: 'AES-GCM', iv: toBuffer(sealed.subarray(0, NONCE_LEN)), additionalData: toBuffer(aad), tagLength: TAG_LEN * 8 },
          key,
          toBuffer(sealed.subarray(NONCE_LEN)),
        );
        return new Uint8Array(pt);
      } catch {
        return fail('P13_RECORD_AUTH', 'record could not be opened');
      }
    },
  };
}
