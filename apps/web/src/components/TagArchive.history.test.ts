import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCurrentReconciliationVault } from '../lib/reconciliationVault';
import { checkpointKeyId } from '../lib/scanClient';
import { clearSession, generateSession } from '../lib/session';
import { memoryIndexedDb } from '../test/memoryIndexedDb';
import { storedHistoryChains } from './TagArchive';

afterEach(() => {
  clearSession();
  vi.unstubAllGlobals();
});

/**
 * storedHistoryChains repeats the database and store names of IdbReconciliationVaultStore (reconciliationVault.ts) and the
 * key format of its records. This test writes through the real vault and adapter, so a rename on either side fails here
 * instead of silently dropping the I-2 warning about history left out of a tag archive (review C-R5).
 */
describe('I-2: the stored-history listing reads where the reconciliation vault writes', () => {
  it('lists the chains whose scan history the real reconciliation vault stored for this seller', async () => {
    vi.stubGlobal('indexedDB', memoryIndexedDb());
    const session = generateSession();
    const keyId = checkpointKeyId(session.spendingPublicKey, session.viewingPublicKey);
    // Nothing is stored yet, and listing must not create the database the vault then upgrades.
    expect(await storedHistoryChains(keyId)).toEqual([]);
    for (const chainId of [84532, 1]) {
      const vault = await createCurrentReconciliationVault(chainId, keyId);
      try {
        await vault.clearRecords();
      } finally {
        vault.lock();
      }
    }
    expect(await storedHistoryChains(keyId)).toEqual([1, 84532]);
    expect(await storedHistoryChains('cd'.repeat(32))).toEqual([]);
  });
});
