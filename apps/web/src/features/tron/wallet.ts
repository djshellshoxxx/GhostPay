import {
  generateKeySet,
  unsafeRevealSecret,
  zeroize,
  type RandomSource,
  type StealthKeySet,
} from '@ghostpay/core-crypto';
import { encodeTronMetaAddress } from '@ghostpay/tron-adapter';
import type { TronNetworkInfo } from './network';
import { TronViewError } from './rpc';

/**
 * In-memory software wallet. NOTHING here is ever written to storage: the key backup is shown to
 * the user once (on request) so they can keep it, and the keys die with the component state.
 * The spending and viewing scalars are redacting `SecretScalar` holders that throw if stringified.
 */
export interface TronWallet {
  readonly keys: StealthKeySet;
  readonly net: TronNetworkInfo;
  /** `st:trx:0x...` meta-address a payer derives one-time addresses from. */
  readonly metaAddress: string;
}

function build(keys: StealthKeySet, net: TronNetworkInfo): TronWallet {
  return {
    keys,
    net,
    metaAddress: encodeTronMetaAddress({ spendingPublicKey: keys.spendingPublicKey, viewingPublicKey: keys.viewingPublicKey }),
  };
}

/** Fresh random keys (global Web Crypto). */
export function newWallet(net: TronNetworkInfo): TronWallet {
  if (!net.enabled) throw new TronViewError('This network is disabled.');
  return build(generateKeySet(), net);
}

/** Serves the backup bytes to `generateKeySet` in order and refuses once they are used up. */
function replayRng(bytes: Uint8Array): RandomSource {
  let off = 0;
  return {
    getRandomValues<T extends ArrayBufferView | null>(array: T): T {
      if (array === null) return array;
      const view = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
      if (off + view.length > bytes.length) throw new Error('exhausted');
      view.set(bytes.subarray(off, off + view.length));
      off += view.length;
      return array;
    },
  };
}

/** Backup text: spending scalar then viewing scalar, 64 bytes as 128 hex characters. */
export function backupHex(w: TronWallet): string {
  const s = unsafeRevealSecret(w.keys.spendingSecret);
  const v = unsafeRevealSecret(w.keys.viewingSecret);
  try {
    return Array.from([...s, ...v], (x) => x.toString(16).padStart(2, '0')).join('');
  } finally {
    zeroize(s, v);
  }
}

/** @throws {TronViewError} with a user-safe message when the text is not a valid key backup. */
export function walletFromBackupHex(text: string, net: TronNetworkInfo): TronWallet {
  const t = text.trim().toLowerCase();
  if (!/^[0-9a-f]{128}$/.test(t)) {
    throw new TronViewError('The key backup must be exactly 128 hexadecimal characters (64 bytes).');
  }
  if (!net.enabled) throw new TronViewError('This network is disabled.');
  const bytes = new Uint8Array(64);
  for (let i = 0; i < 64; i++) bytes[i] = Number.parseInt(t.slice(2 * i, 2 * i + 2), 16);
  try {
    return build(generateKeySet(replayRng(bytes)), net);
  } catch {
    throw new TronViewError('These are not valid keys.');
  } finally {
    zeroize(bytes);
  }
}

/** Best-effort wipe of both secret scalars (used on lock and unmount). */
export function wipeWallet(w: TronWallet): void {
  zeroize(w.keys.spendingSecret, w.keys.viewingSecret);
}
