import { checkpointKeyId } from '@ghostpay/ux-vault/portable';
import { wipe } from '@ghostpay/secret-box';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { getSessionPublic, revealViewingKey, type SessionPublic } from './session';

/**
 * Lends the viewing private key of the seller keys `keyId` names to `use`, then wipes the copy. Returns `undefined`, without
 * calling `use`, when those keys are not the ones loaded. `use` must not keep the bytes.
 */
export interface ViewingKeyLender {
  <T>(keyId: string, use: (viewingKey: Uint8Array) => T): T | undefined;
  /**
   * Optional check that touches no secret: a token for the loaded keys if they are the ones `keyId` names, and `undefined`
   * exactly when the lender would refuse. Replacing or wiping the keys yields a new token. Without it, nothing derived from a
   * lent key can be reused (see {@link checkpointSlotNamer}).
   */
  readonly loaded?: (keyId: string) => object | undefined;
}

/**
 * The session's public snapshot if it holds the keys `keyId` names. `getSessionPublic` returns a new object on every install
 * and every wipe, notified or not (`subscribeSession` misses `clearSession(false)`), so the identity marks every key change.
 */
function sessionHolding(keyId: string): SessionPublic | undefined {
  const pub = getSessionPublic();
  return pub !== undefined && checkpointKeyId(pub.spendingPublicKey, pub.viewingPublicKey) === keyId ? pub : undefined;
}

/** The loaded session's viewing key, and only for its own key id: a checkpoint is never read or written for other keys. */
export const sessionViewingKey: ViewingKeyLender = Object.assign(<T>(keyId: string, use: (viewingKey: Uint8Array) => T): T | undefined => {
  if (sessionHolding(keyId) === undefined) return undefined;
  const viewingKey = revealViewingKey();
  try {
    return use(viewingKey);
  } finally {
    wipe(viewingKey);
  }
}, { loaded: sessionHolding });

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

/**
 * Names slots ({@link checkpointSlot}) for one store, borrowing the key from `lender`, or `undefined` when it refuses. The Scan
 * view loads its checkpoint on every render and a scan saves after every page, so when the lender has `loaded` each name is
 * kept per chain and key id and reused, without lending the key again, only while `loaded` still returns the token it was
 * derived under. Any other answer (keys wiped, replaced, or not `keyId`'s) drops every kept name first.
 *
 * Keeping the names adds no exposure: each is a PRF output that is already written to storage as a key, and none says
 * anything about the viewing key.
 */
export function checkpointSlotNamer(lender: ViewingKeyLender): (chainId: number, keyId: string) => string | undefined {
  const names = new Map<string, string>();
  let token: object | undefined;
  const derive = (chainId: number, keyId: string): string | undefined => lender(keyId, (vk) => checkpointSlot(vk, chainId, keyId));
  return (chainId, keyId) => {
    if (lender.loaded === undefined) return derive(chainId, keyId);
    const now = lender.loaded(keyId);
    if (now !== token) {
      names.clear();
      token = now;
    }
    if (now === undefined) return undefined;
    const id = `${String(chainId)}|${keyId}`;
    let name = names.get(id);
    if (name === undefined) {
      name = derive(chainId, keyId);
      if (name !== undefined) names.set(id, name);
    }
    return name;
  };
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
