import { keccak256, type Address } from 'viem';
import { fail } from './errors.js';
import { assertChainAllowed } from './guard.js';
import type { ManifestEntry } from './manifest.js';
import type { ChainReader } from './types.js';

/**
 * EP-GEN-4: reads `eth_getCode` for each contract of a verified manifest entry and compares the
 * keccak256 with the pinned hash.
 *
 * @param chain Read-only chain access.
 * @param entry Manifest entry; must be `verified`.
 * @throws ExternalPoolError CODE_HASH_MISMATCH for empty code or a different hash; MANIFEST_MISMATCH
 *   when the entry is not verified; CHAIN_NOT_ALLOWED before any call.
 * @security Fail closed: an `unverified` entry is never accepted, and a node returning `0x` is a mismatch.
 */
export async function verifyCodeHashes(chain: ChainReader, entry: ManifestEntry): Promise<void> {
  assertChainAllowed(entry.chainId);
  if (entry.status !== 'verified') fail('MANIFEST_MISMATCH', `manifest entry ${entry.route} is not verified`);
  for (const [name, address] of Object.entries<Address>(entry.contracts)) {
    const pinned = entry.codeHashes[name];
    if (pinned === undefined) fail('MANIFEST_MISMATCH', `no pinned code hash for ${name}`);
    const code = await chain.getCode(entry.chainId, address);
    if (code === '0x' || code.length <= 2) fail('CODE_HASH_MISMATCH', `no code at ${name}`);
    if (keccak256(code) !== pinned.toLowerCase()) fail('CODE_HASH_MISMATCH', `code hash of ${name} differs from the manifest`);
  }
}

/**
 * Compares downloaded artifact digests with the manifest (EP-PP-6, EP-RG-3).
 *
 * @param entry Manifest entry holding `artifactSha256`.
 * @param actual File name to SHA-256 hex of the bytes actually loaded.
 * @throws ExternalPoolError ARTIFACT_HASH_MISMATCH when a pinned file is missing or different.
 */
export function assertArtifactHashes(entry: ManifestEntry, actual: Readonly<Record<string, string>>): void {
  const pinned = entry.artifactSha256;
  if (pinned === undefined) fail('ARTIFACT_HASH_MISMATCH', 'manifest pins no artifact hashes');
  for (const [file, digest] of Object.entries(pinned)) {
    const got = actual[file];
    if (got === undefined || got.toLowerCase() !== digest) fail('ARTIFACT_HASH_MISMATCH', `artifact ${file} differs from the manifest`);
  }
}
