/** Opaque identity of the local history requested by the caller. The revision identifies an immutable snapshot. */
export interface LocalHistoryScope {
  readonly chainId: string;
  readonly profileRef: string;
  readonly revision: string;
}

/**
 * A trusted history provider supplies completeness separately from the contents of its ledger.
 * A reader must not synthesize a complete snapshot from imported records or a missing storage value.
 */
export interface LocalHistorySnapshot {
  readonly scope?: LocalHistoryScope;
  readonly coverage: 'complete' | 'partial';
  readonly provenance: 'local' | 'imported';
  readonly observationCount: number;
}

export type HistoryCoverage = 'unknown' | 'complete-empty' | 'complete-nonempty';

const MAX_OBSERVATIONS = 10_000; // P08 review limit.

function validReference(value: string): boolean {
  return typeof value === 'string' && value.length > 0 && value.trim() === value;
}

/** Reports coverage of this local snapshot only. The result carries no identifiers or transaction decision. */
export function classifyHistoryCoverage(
  requested: LocalHistoryScope,
  snapshot?: LocalHistorySnapshot | null,
): HistoryCoverage {
  if (snapshot?.coverage !== 'complete' || snapshot.provenance !== 'local') return 'unknown';
  const { scope, observationCount } = snapshot;
  if (!validReference(requested.chainId) || !validReference(requested.profileRef) || !validReference(requested.revision) ||
      scope?.chainId !== requested.chainId || scope.profileRef !== requested.profileRef || scope.revision !== requested.revision ||
      !Number.isSafeInteger(observationCount) || observationCount < 0 || observationCount > MAX_OBSERVATIONS) return 'unknown';
  return observationCount === 0 ? 'complete-empty' : 'complete-nonempty';
}
