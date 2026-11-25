import { checkpointKeyId, createReconciliationApi, type ReconciliationScope } from '@ghostpay/ux-vault/portable';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { Page } from '@playwright/test';

/** Write prepared encrypted reconciliation ciphertexts into the page's existing IndexedDB store. */
export async function copyEncryptedLedger(page: Page, ciphertexts: Map<string, string>): Promise<void> {
  // Opening the dashboard has already created this browser's encrypted reconciliation store.
  await page.evaluate((entries) => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open('ghostpay-reconciliation-encrypted', 1);
    open.onerror = () => reject(new Error('Failed to open encrypted reconciliation database', { cause: open.error }));
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction('vaults', 'readwrite');
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = () => { db.close(); reject(new Error('Encrypted reconciliation fixture transaction aborted', { cause: tx.error })); };
      for (const [key, ciphertext] of entries) tx.objectStore('vaults').put(ciphertext, key);
    };
  }), [...ciphertexts]);
}

/** Synthetic seller keys plus a real portable vault that encrypts into an in-memory map. */
export async function syntheticLedger(chainId: number, fill: { spending: number; viewing: number }) {
  const spending = new Uint8Array(32).fill(fill.spending);
  const viewing = new Uint8Array(32).fill(fill.viewing);
  const scope: ReconciliationScope = {
    chainId,
    sellerKeyId: checkpointKeyId(bytesToHex(secp256k1.getPublicKey(spending)), bytesToHex(secp256k1.getPublicKey(viewing))),
  };
  const ciphertexts = new Map<string, string>();
  const { ReconciliationVault } = createReconciliationApi();
  const vault = new ReconciliationVault({
    read: (key) => Promise.resolve(ciphertexts.get(key) ?? null),
    compareAndSwap: (key, previous, next, guard) => {
      guard();
      if ((ciphertexts.get(key) ?? null) !== previous) return Promise.resolve(false);
      ciphertexts.set(key, next);
      return Promise.resolve(true);
    },
  }, scope, () => undefined);
  await vault.unlock(viewing.slice());
  return { scope, ciphertexts, vault, spendingHex: bytesToHex(spending), viewingHex: bytesToHex(viewing) };
}

/** Load the synthetic seller keys through the real Seller view, then open the dashboard route. */
export async function loadSellerAndOpenDashboard(page: Page, spendingHex: string, viewingHex: string): Promise<void> {
  await page.goto('/');
  await page.locator('nav button[data-view="seller"]').click();
  await page.getByText('Import existing keys (hex)', { exact: true }).click();
  await page.getByLabel('Spending private key (64 hex characters)').fill(spendingHex);
  await page.getByLabel('Viewing private key (64 hex characters)').fill(viewingHex);
  await page.getByRole('button', { name: 'Load keys' }).click();
  await page.locator('nav button[data-view="dashboard"]').click();
}
