// @vitest-environment jsdom
import { routerNet } from '@ghostpay/chain-adapters';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UserFacingError } from './errors';
import type { ReconciliationRecord } from './reconciliationLedger';
import { registrationFromInvoice } from './reconciliationMatch';
import { NOW, testInvoice } from './reconciliationMatch.testutil';
import { currentReconciliationPresence } from './reconciliationPresence';
import {
  IdbReconciliationVaultStore,
  checkPageWithoutVault,
  createCurrentReconciliationVault,
  isReconciliationStorageUnavailable,
} from './reconciliationVault';
import { checkpointKeyId } from './scanClient';
import { clearSession, generateSession } from './session';

const CHAIN_ID = 84532;
let keyId = '';

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  const pub = generateSession();
  keyId = checkpointKeyId(pub.spendingPublicKey, pub.viewingPublicKey);
});
afterEach(() => { clearSession(); vi.unstubAllGlobals(); });

function observation(n: number, overrides: Partial<ReconciliationRecord> = {}): ReconciliationRecord {
  const tx = `0x${n.toString(16).padStart(64, '0')}`;
  const base = {
    version: 1 as const, sellerKeyId: keyId, chainId: CHAIN_ID, transactionHash: tx, blockHash: `0x${'c'.repeat(64)}`,
    blockNumber: String(100 + n), blockTimestamp: String(NOW + 60), stealthAddress: `0x${'d'.repeat(40)}`, logIndex: 0,
    asset: 'native', amountMinorUnits: routerNet(1_000_000n).toString(), viewTagMatched: true, recordedAt: (NOW + 60) * 1000,
    evidenceStatus: 'verified-at-scan' as const, evidenceSource: 'verified-router-scan' as const, ...overrides,
  };
  return { ...base, id: `${keyId}:${CHAIN_ID}:${tx}:${base.stealthAddress}:${base.blockHash}:0` };
}

describe('browser reconciliation vault presence (LATE-M1)', () => {
  it('records absent when this scope has no vault, and present once anything is stored', async () => {
    expect(currentReconciliationPresence(CHAIN_ID, keyId)).toBe('unknown');
    const vault = await createCurrentReconciliationVault(CHAIN_ID, keyId);
    try {
      expect(await vault.read()).toEqual([]);
      expect(currentReconciliationPresence(CHAIN_ID, keyId)).toBe('absent');
      // A page without registered invoices writes nothing, so the scope stays absent.
      await vault.observeInvoicePayments([observation(1)]);
      expect(currentReconciliationPresence(CHAIN_ID, keyId)).toBe('absent');
      await vault.registerInvoice(registrationFromInvoice(testInvoice(), 1));
      expect(currentReconciliationPresence(CHAIN_ID, keyId)).toBe('present');
    } finally { vault.lock(); }
    // Another chain of the same keys is a separate scope.
    expect(currentReconciliationPresence(11155111, keyId)).toBe('unknown');
    // Replaced keys never see this scope's presence.
    generateSession();
    expect(currentReconciliationPresence(CHAIN_ID, keyId)).toBe('unknown');
  });

  it('keeps the plaintext scope out of browser storage names and values', async () => {
    const vault = await createCurrentReconciliationVault(CHAIN_ID, keyId);
    try { await vault.read(); } finally { vault.lock(); }
    const names = Object.keys(window.localStorage);
    expect(names.some((name) => name.startsWith('ghostpay.reconciliation.presence.v1.'))).toBe(true);
    for (const name of names) {
      expect(name).not.toContain(keyId);
      expect(window.localStorage.getItem(name)).not.toContain(keyId);
    }
  });
});

describe('unavailable encrypted reconciliation storage (LATE-M1)', () => {
  it.each([
    ['refuses access', () => ({ open: () => { throw new DOMException('denied', 'SecurityError'); } })],
    ['is missing', () => undefined],
  ])('reports IndexedDB that %s as unavailable storage, not as a raw error', async (_label, factory) => {
    vi.stubGlobal('indexedDB', factory());
    const failure = await new IdbReconciliationVaultStore().read('scope').then(() => undefined, (error: unknown) => error);
    expect(failure).toBeInstanceOf(UserFacingError);
    expect(failure).toMatchObject({ translation: { key: 'error.reconciliationVault.encryptedReconciliationStorageIsUnavailable' } });
    expect(isReconciliationStorageUnavailable(failure)).toBe(true);
  });

  it('counts only failures to open as unavailable storage', () => {
    const error = (key: string) => new UserFacingError({ key } as never);
    expect(isReconciliationStorageUnavailable(error('error.reconciliationVault.closeOtherGhostPayTabsToOpenEncryptedReconciliationStorage'))).toBe(true);
    for (const key of [
      'error.reconciliationVault.encryptedReconciliationStorageCouldNotBeRead',
      'error.reconciliationVault.couldNotDecryptOrValidateTheReconciliationData',
      'error.reconciliationVault.encryptedReconciliationStorageIsFull',
      'error.reconciliationVault.onlyACurrentVerifiedScanObservationCanBeSaved',
    ]) expect(isReconciliationStorageUnavailable(error(key))).toBe(false);
    expect(isReconciliationStorageUnavailable(new Error('error.reconciliationVault.encryptedReconciliationStorageIsUnavailable'))).toBe(false);
    expect(isReconciliationStorageUnavailable(undefined)).toBe(false);
  });
});

describe('page checks without a stored vault (LATE-M1)', () => {
  it('accepts a valid page and refuses contradictory, foreign or annotated observations, without touching IndexedDB', async () => {
    const open = vi.fn(() => { throw new Error('IndexedDB must not be used'); });
    vi.stubGlobal('indexedDB', { open });
    const guard = (): void => undefined;
    const page = { from: 100n, through: 200n, canonicalHash: () => Promise.resolve(`0x${'c'.repeat(64)}`) };
    await expect(checkPageWithoutVault(CHAIN_ID, keyId, [observation(1), observation(2)], guard, page)).resolves.toBeUndefined();
    await expect(checkPageWithoutVault(CHAIN_ID, keyId, [], guard, page)).resolves.toBeUndefined();
    await expect(checkPageWithoutVault(CHAIN_ID, keyId, [observation(1), observation(1, { amountMinorUnits: '1' })], guard, page))
      .rejects.toMatchObject({ translation: { key: 'error.reconciliationVault.onlyACurrentVerifiedScanObservationCanBeSaved' } });
    await expect(checkPageWithoutVault(CHAIN_ID, keyId, [observation(1, { chainId: 1 })], guard, page)).rejects.toThrow();
    await expect(checkPageWithoutVault(CHAIN_ID, keyId, [observation(1, { invoiceDigest: `0x${'e'.repeat(64)}` })], guard, page)).rejects.toThrow();
    await expect(checkPageWithoutVault(CHAIN_ID, keyId, [observation(1)], () => { throw new Error('stale scan'); }, page)).rejects.toThrow('stale scan');
    expect(open).not.toHaveBeenCalled();
  });
});
