import { checkpointKeyId } from '@ghostpay/ux-vault/portable';
import { wipe } from '@ghostpay/secret-box';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { getSessionPublic, revealViewingKey } from './session';

/**
 * Lends the viewing private key of the seller keys `keyId` names to `use`, then wipes the copy. Returns `undefined`, without
 * calling `use`, when those keys are not the ones loaded. `use` must not keep the bytes.
 */
export type ViewingKeyLender = <T>(keyId: string, use: (viewingKey: Uint8Array) => T) => T | undefined;

/** The loaded session's viewing key, and only for its own key id: a checkpoint is never read or written for other keys. */
export const sessionViewingKey: ViewingKeyLender = (keyId, use) => {
  const pub = getSessionPublic();
  if (pub === undefined || checkpointKeyId(pub.spendingPublicKey, pub.viewingPublicKey) !== keyId) return undefined;
  const viewingKey = revealViewingKey();
  try {
    return use(viewingKey);
  } finally {
    wipe(viewingKey);
  }
};

/** v3 (SEC-22): pseudonymous slot names. */
export const CHECKPOINT_SLOT_PREFIX = 'ghostpay.scan.checkpoint.v3.';
const SLOT_INFO = 'GhostPay/scan-checkpoint/v3/slot';

/**
 * Storage slot of the scan cursor of `keyId` on `chainId`: HKDF-SHA256(viewing key, no salt, label|chainId|keyId) as hex.
 * Without the viewing key nobody can tell from the name which seller (or chain) it belongs to.
 */
export function checkpointSlot(viewingKey: Uint8Array, chainId: number, keyId: string): string {
  return `${CHECKPOINT_SLOT_PREFIX}${bytesToHex(hkdf(sha256, viewingKey, undefined, utf8ToBytes(`${SLOT_INFO}|${String(chainId)}|${keyId}`), 32))}`;
}

const V1_PREFIX = 'ghostpay.scan.checkpoint.v1.';
const V2_PREFIX = 'ghostpay.scan.checkpoint.v2.';

/**
 * v2 slot, named from the public keys alone (`chainId.sha256(spend|view)`): anyone with the meta-address could find it. Never
 * read; deleted after the first v3 save and on clear, and swept for every chain and key set (see {@link isLegacyCheckpointSlot}).
 */
export function legacyCheckpointSlot(chainId: number, keyId: string): string {
  return `${V2_PREFIX}${String(chainId)}.${keyId}`;
}

/**
 * True for a slot of a legacy format, named from public data alone: v2 (see {@link legacyCheckpointSlot}) and v1
 * (`v1.<chainId>`, never attributable to a key, but it names a chain this browser scanned, which v3 names hide). Neither is
 * ever read, so a store deletes them all without needing any key.
 */
export function isLegacyCheckpointSlot(name: string): boolean {
  return name.startsWith(V1_PREFIX) || name.startsWith(V2_PREFIX);
}
