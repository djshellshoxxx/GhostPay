import { describe, expect, it, vi, type Mock } from 'vitest';
import type { ReconciliationState } from '../../../lib/reconciliationVault';
import { releaseIfLedgerUnchanged, type LedgerReader } from './release';

const state = (marker: string): ReconciliationState => ({
  records: [], readOnly: marker === 'read-only', invoices: [], receipts: [],
});
const fingerprint = (value: ReconciliationState): string => (value.readOnly ? 'read-only' : 'writable');

function reader(next: () => Promise<ReconciliationState>): {
  readonly vault: LedgerReader;
  readonly readState: Mock<() => Promise<ReconciliationState>>;
  readonly lock: Mock<() => void>;
} {
  const readState = vi.fn(next);
  const lock = vi.fn<() => void>();
  return { vault: { readState, lock }, readState, lock };
}

describe('dashboard export release check over the existing reconciliation vault interface', () => {
  it('releases once when a fresh authenticated read still matches the reviewed ledger', async () => {
    const ledger = reader(() => Promise.resolve(state('writable')));
    const release = vi.fn();
    await expect(releaseIfLedgerUnchanged(() => Promise.resolve(ledger.vault), 'writable', fingerprint, release)).resolves.toBe(true);
    expect(release).toHaveBeenCalledOnce();
    expect(ledger.readState).toHaveBeenCalledOnce();
    expect(ledger.lock).toHaveBeenCalledOnce();
  });

  it('withholds the file when the ledger changed after review', async () => {
    const ledger = reader(() => Promise.resolve(state('read-only')));
    const release = vi.fn();
    await expect(releaseIfLedgerUnchanged(() => Promise.resolve(ledger.vault), 'writable', fingerprint, release)).resolves.toBe(false);
    expect(release).not.toHaveBeenCalled();
    expect(ledger.lock).toHaveBeenCalledOnce();
  });

  it('withholds the file when the caller is no longer current at release time', async () => {
    const ledger = reader(() => Promise.resolve(state('writable')));
    const release = vi.fn();
    const stillCurrent = vi.fn(() => false);
    await expect(releaseIfLedgerUnchanged(() => Promise.resolve(ledger.vault), 'writable', fingerprint, release, stillCurrent))
      .resolves.toBe(false);
    expect(stillCurrent).toHaveBeenCalledOnce();
    expect(release).not.toHaveBeenCalled();
  });

  it('locks the vault and propagates authentication or storage failures without releasing', async () => {
    const ledger = reader(() => Promise.reject(new Error('could not decrypt')));
    const release = vi.fn();
    await expect(releaseIfLedgerUnchanged(() => Promise.resolve(ledger.vault), 'writable', fingerprint, release))
      .rejects.toThrow('could not decrypt');
    expect(release).not.toHaveBeenCalled();
    expect(ledger.lock).toHaveBeenCalledOnce();
  });

  it('locks the vault when the release callback throws', async () => {
    const ledger = reader(() => Promise.resolve(state('writable')));
    await expect(releaseIfLedgerUnchanged(() => Promise.resolve(ledger.vault), 'writable', fingerprint, () => {
      throw new Error('download blocked');
    })).rejects.toThrow('download blocked');
    expect(ledger.lock).toHaveBeenCalledOnce();
  });

  it('does not read or release when the vault cannot be opened', async () => {
    const release = vi.fn();
    await expect(releaseIfLedgerUnchanged(() => Promise.reject(new Error('scope changed')), 'writable', fingerprint, release))
      .rejects.toThrow('scope changed');
    expect(release).not.toHaveBeenCalled();
  });
});
