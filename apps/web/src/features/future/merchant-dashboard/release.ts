import type { ReconciliationState } from '../../../lib/reconciliationVault';

/** The subset of the existing reconciliation vault handle the dashboard needs for a read-only recheck. */
export interface LedgerReader {
  readState(): Promise<ReconciliationState>;
  lock(): void;
}

/**
 * Release an export only if a fresh authenticated read of the encrypted ledger still matches the reviewed one.
 *
 * Uses only the existing vault interface (open, readState, lock), so the reconciliation vault is not changed.
 * `release` runs synchronously in the same task that observed the matching state. A write committed by another tab
 * after that read is a later change: the file still reflects a ledger state that was authenticated and current at
 * release. An IndexedDB-transaction-scoped release would need a new vault API (see apps/web/DEVIATIONS.md, "Merchant dashboard").
 */
export async function releaseIfLedgerUnchanged(
  open: () => Promise<LedgerReader>,
  expectedFingerprint: string,
  fingerprint: (state: ReconciliationState) => string,
  release: (state: ReconciliationState) => void,
  stillCurrent: () => boolean = () => true,
): Promise<boolean> {
  const vault = await open();
  try {
    const state = await vault.readState();
    if (!stillCurrent() || fingerprint(state) !== expectedFingerprint) return false;
    release(state);
    return true;
  } finally {
    vault.lock();
  }
}
