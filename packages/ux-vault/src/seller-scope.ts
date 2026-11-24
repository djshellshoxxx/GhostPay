import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

/**
 * Identifies the seller keys a checkpoint belongs to: `sha256(spendingPub|viewingPub)` as hex. A checkpoint is only valid for
 * the keys (and chain) it was written for, so a key rotation or a second profile never inherits another profile's position.
 */
export function checkpointKeyId(spendingPublicKeyHex: string, viewingPublicKeyHex: string): string {
  return bytesToHex(sha256(utf8ToBytes(`${spendingPublicKeyHex.toLowerCase()}|${viewingPublicKeyHex.toLowerCase()}`)));
}
