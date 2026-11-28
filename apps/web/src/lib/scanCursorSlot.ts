import { checkpointKeyId } from '@ghostpay/ux-vault/portable';
import { wipe } from '@ghostpay/secret-box';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { captureSessionGuard, getSessionPublic, revealViewingKey, type SessionPublic } from './session';

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
 * The active session's public snapshot if it holds the keys `keyId` names. Every install creates a new snapshot and every
 * wipe removes it, notified or not (`subscribeSession` misses `clearSession(false)`). Idle suspension keeps that snapshot,
 * so the secret-free guard also checks the deadline and refuses suspended access before any cached slot is reused.
 */
function sessionHolding(keyId: string): SessionPublic | undefined {
  try { captureSessionGuard(); } catch { return undefined; }
  const pub = getSessionPublic();
  return pub !== undefined && checkpointKeyId(pub.spendingPublicKey, pub.viewingPublicKey) === keyId ? pub : undefined;
}

/** The loaded session's viewing key, and only for its own key id: a checkpoint is never read or written for other keys. */
export const sessionViewingKey: ViewingKeyLender = Object.assign(<T>(keyId: string, use: (viewingKey: Uint8Array) => T): T | undefined => {
  const expected = sessionHolding(keyId);
  if (expected === undefined) return undefined;
  let viewingKey: Uint8Array;
  try { viewingKey = revealViewingKey(); } catch { return undefined; }
  try {
    // Borrowing checks the deadline again. A lock listener may replace the wallet during that observation.
    if (getSessionPublic() !== expected) return undefined;
    return use(viewingKey);
  } finally {
    wipe(viewingKey);
  }
}, { loaded: sessionHolding });

/** v4: a single HKDF format after the incompatible HKDF and HMAC v3 implementations. */
export const CHECKPOINT_SLOT_PREFIX = 'ghostpay.scan.checkpoint.v4.';
const SLOT_INFO = 'GhostPay/scan-checkpoint/v4/slot';

/**
 * Storage slot of the scan cursor of `keyId` on `chainId`: HKDF-SHA256(viewing key, no salt, label|chainId|keyId) as hex.
 * Holding only the public meta-address is not sufficient to derive the seller/chain slot name.
 */
export function checkpointSlot(viewingKey: Uint8Array, chainId: number, keyId: string): string {
  if (viewingKey.length !== 32) throw new Error('invalid viewing key');
  return `${CHECKPOINT_SLOT_PREFIX}${bytesToHex(hkdf(sha256, viewingKey, undefined, utf8ToBytes(`${SLOT_INFO}|${String(chainId)}|${keyId}`), 32))}`;
}

/**
 * Names slots ({@link checkpointSlot}) for one store, borrowing the key from `lender`, or `undefined` when it refuses. The Scan
 * view loads its checkpoint on every render and a scan saves after every page, so when the lender has `loaded` each name is
 * kept per chain and key id and reused, without lending the key again, only while `loaded` still returns the token it was
 * derived under. Any other answer (keys wiped, replaced, or not `keyId`'s) drops every kept name first.
 *
 * Only derived slot names are retained, never viewing-key bytes. Every cache access still checks the loaded-session token.
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
const V3_PREFIX = 'ghostpay.scan.checkpoint.v3.';

/**
 * v2 slot, named from the public keys alone (`chainId.sha256(spend|view)`): anyone with the meta-address could find it. Never
 * read; deleted after the first v4 save and on clear, and swept for every chain and key set (see {@link isLegacyCheckpointSlot}).
 */
export function legacyCheckpointSlot(chainId: number, keyId: string): string {
  return `${V2_PREFIX}${String(chainId)}.${keyId}`;
}

/**
 * Legacy formats: v1 exposes the chain; v2 also permits matching public seller keys; v3 has two incompatible derivations
 * (HKDF in #211, HMAC in #222) under the same prefix. None is read or migrated. A store deletes these exact prefixes without
 * needing keys, then requires a deliberate rescan from the chosen start block. Other prefixes, including v4, are untouched.
 */
export function isLegacyCheckpointSlot(name: string): boolean {
  return name.startsWith(V1_PREFIX) || name.startsWith(V2_PREFIX) || name.startsWith(V3_PREFIX);
}
