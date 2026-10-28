import {
  deriveStealthKeysFromSeed,
  encodeMetaAddress,
  zeroize,
  type StealthKeys,
} from '@ghostpay/solana-stealth';
import type { SolNetworkInfo } from './network';
import { SolViewError } from './rpc';

/**
 * In-memory software wallet. NOTHING here is ever written to storage: the seed of a wallet created
 * here is shown only on request so the user can back it up (the view keeps it as bytes until Lock),
 * and the keys die with the component state.
 * The spend and view scalars are redacting `SecretScalar` holders that throw if stringified.
 */
export interface SolWallet {
  readonly keys: StealthKeys;
  readonly net: SolNetworkInfo;
  /** `st:sol:...` meta-address a payer derives one-time addresses from. */
  readonly metaAddress: string;
}

const SEED_BYTES = 32;

export function randomSeedHex(rng: Pick<Crypto, 'getRandomValues'> = globalThis.crypto): string {
  const b = new Uint8Array(SEED_BYTES);
  rng.getRandomValues(b);
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  zeroize(b);
  return hex;
}

/** @throws {Error} with a user-safe message when the seed text is not 32 bytes of hex. */
export function walletFromSeedHex(seedHex: string, net: SolNetworkInfo): SolWallet {
  const t = seedHex.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(t)) throw new SolViewError('The seed must be exactly 64 hexadecimal characters (32 bytes).');
  if (!net.enabled) throw new SolViewError('This network is disabled.');
  const seed = new Uint8Array(SEED_BYTES);
  for (let i = 0; i < SEED_BYTES; i++) seed[i] = Number.parseInt(t.slice(2 * i, 2 * i + 2), 16);
  try {
    const keys = deriveStealthKeysFromSeed(seed);
    return { keys, net, metaAddress: encodeMetaAddress(net.cluster, keys.spendPublicKey, keys.viewPublicKey) };
  } finally {
    zeroize(seed);
  }
}

/** Best-effort wipe of both secret scalars (used on lock and unmount). */
export function wipeWallet(w: SolWallet): void {
  zeroize(w.keys.spendSecret, w.keys.viewSecret);
}
