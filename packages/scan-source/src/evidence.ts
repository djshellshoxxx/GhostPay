import type { PublicLogSource } from './types.js';

/**
 * What a scan source has actually established about its answer, per axis. Descriptive only: it never changes
 * how a source behaves. Every level is a statement about THIS code, not about the capability a source could have.
 */
export interface ScanEvidence {
  /**
   * Are the block hashes attached to returned records the real chain's?
   * `unverified`: one provider asserted them. `cross-checked`: a second, independent source agreed (agreement
   * of sources is not chain authentication). `verified`: checked against a light client's verified header chain.
   */
  readonly blockIdentity: 'unverified' | 'cross-checked' | 'verified';
  /** Is each RETURNED record proven to be a log of its block (receipts/log proof)? */
  readonly recordInclusion: 'unverified' | 'verified';
  /** Is the returned set proven to hold EVERY announcement in the interval (absence of omissions)? */
  readonly intervalCompleteness: 'unverified' | 'verified';
}

/** Optional facts about the light client behind a `light` source. */
export interface ScanEvidenceOptions {
  readonly lightClient?: { readonly verifiesLogs: boolean };
}

/**
 * Describes the evidence a source provides, from its `kind` and `integrity`. Pure; never upgrades a claim
 * beyond what the implementation checks today.
 *
 * Per kind:
 * - `range`: one provider's assertion on every axis: all `unverified`.
 * - `indexer`: block hashes are cross-checked against a second source (`cross-checked`); no inclusion proof and
 *   the indexer can omit logs: `unverified`, `unverified`.
 * - `pir2`: page hashes are checked against a manifest the servers themselves publish. That is internal
 *   consistency, not chain authentication, and only the head hash is compared with a third source, not the
 *   block hash of each record: all `unverified`.
 * - `light`: returned heads and blocks are confirmed by the light client's header chain (`verified`). Record
 *   inclusion is `verified` only when `integrity === 'proof'` (and, if given, `lightClient.verifiesLogs`).
 * - `quorum`: sources agreeing is `cross-checked` at best; no inclusion proof.
 *
 * @security `intervalCompleteness` is `unverified` for EVERY input. A verified block header proves a block
 * exists, not that all of its logs were returned; a capability flag (`verifiesLogs`, `integrity: 'proof'`) is
 * not evidence; and even a real inclusion proof covers the records returned, not the ones omitted. UI must not
 * claim a complete scan on the strength of this function. Nothing in this package can produce `verified` here.
 */
export function describeScanEvidence(source: Pick<PublicLogSource, 'kind' | 'integrity'>, o: ScanEvidenceOptions = {}): ScanEvidence {
  const intervalCompleteness = 'unverified';
  switch (source.kind) {
    case 'range':
    case 'pir2':
      return { blockIdentity: 'unverified', recordInclusion: 'unverified', intervalCompleteness };
    case 'indexer':
    case 'quorum':
      return { blockIdentity: 'cross-checked', recordInclusion: 'unverified', intervalCompleteness };
    case 'light': {
      const proves = source.integrity === 'proof' && (o.lightClient === undefined || o.lightClient.verifiesLogs);
      return { blockIdentity: 'verified', recordInclusion: proves ? 'verified' : 'unverified', intervalCompleteness };
    }
  }
}
