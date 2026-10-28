import {
  buildBitcoinUri,
  silentPaymentKeysFromSeed,
  encodeSilentPaymentAddress,
  zeroize,
  type SilentPaymentKeys,
} from '@ghostpay/btc-silent-payments';
import type { BtcNetworkInfo } from './network';

/**
 * In-memory software wallet. NOTHING here is ever written to storage: the seed is shown to the
 * user once (on request) so they can back it up, and the keys die with the component state.
 */
export interface BtcWallet {
  readonly keys: SilentPaymentKeys;
  readonly net: BtcNetworkInfo;
  /** `tsp1...` receive address (BIP-352). */
  readonly address: string;
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
export function walletFromSeedHex(seedHex: string, net: BtcNetworkInfo): BtcWallet {
  const t = seedHex.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(t)) throw new Error('The seed must be exactly 64 hexadecimal characters (32 bytes).');
  if (!net.enabled) throw new Error('This network is disabled.');
  const seed = new Uint8Array(SEED_BYTES);
  for (let i = 0; i < SEED_BYTES; i++) seed[i] = Number.parseInt(t.slice(2 * i, 2 * i + 2), 16);
  try {
    const keys = silentPaymentKeysFromSeed(seed, { network: net.spNetwork });
    return { keys, net, address: encodeSilentPaymentAddress(net.spNetwork, keys.scanPublicKey, keys.spendPublicKey) };
  } finally {
    zeroize(seed);
  }
}

/** Best-effort wipe of both secret scalars (used on lock, unmount and when another wallet replaces this one). */
export function wipeWallet(w: BtcWallet): void {
  zeroize(w.keys.scanSecret, w.keys.spendSecret);
}

/** `bitcoin:?sp=<address>[&amount=<btc>]` for a payer's silent-payments-capable wallet. */
export function paymentUri(wallet: BtcWallet, amountSats?: bigint, label?: string): string {
  return buildBitcoinUri({
    address: wallet.address,
    ...(amountSats === undefined ? {} : { amountSats }),
    ...(label === undefined || label === '' ? {} : { label }),
  });
}
