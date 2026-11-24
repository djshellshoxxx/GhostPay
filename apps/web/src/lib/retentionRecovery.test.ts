import { afterEach, expect, it } from 'vitest';
import { createReconciliationApi } from '@ghostpay/ux-vault/portable';
import { signReceipt } from '@ghostpay/invoice-schema';
import { beginAttempt, finishAttempt, readAttempts } from './duplicateAttemptJournal';
import { exportRawPrivateKey } from './paymentKeyExport';
import { codeRpc, loadVectorSeller, TEST_N, VECTOR_CHAIN, VECTORS, vectorMatch } from './paymentKeyExport.testutil';
import { checkpointKeyId } from './scanClient';
import { captureSessionGuard, clearSession, exportKeystore, importKeystore, revealViewingKey } from './session';

afterEach(() => clearSession());

it('restores the original wallet and derives the same payment spending key after both metadata cleanups', async () => {
  const seller = loadVectorSeller();
  const match = vectorMatch('a1');
  const passphrase = 'retention recovery synthetic wallet';
  const backup = await exportKeystore(passphrase, { N: TEST_N });
  const scope = { chainId: VECTOR_CHAIN, sellerKeyId: checkpointKeyId(seller.spendingPublicKey, seller.viewingPublicKey) };
  const slots = new Map<string, string>();
  const journal = { getItem: (key: string) => slots.get(key) ?? null, setItem: (key: string, value: string) => { slots.set(key, value); } };
  const input = { account: match.stealthAddress, chainId: VECTOR_CHAIN, kind: 'payment' as const };
  beginAttempt({ ...input, key: '0x' + 'ab'.repeat(32) }, journal);
  const submitted = beginAttempt({ ...input, key: '0x' + 'bc'.repeat(32) }, journal);
  const hash = '0x' + 'cd'.repeat(32);
  finishAttempt(submitted, hash, journal);
  const attempts = readAttempts(journal);
  const api = createReconciliationApi();
  const vault = new api.ReconciliationVault({
    read: (key) => Promise.resolve(slots.get(key) ?? null),
    compareAndSwap: (key, before, after, guard) => {
      guard();
      if ((slots.get(key) ?? null) !== before) return Promise.resolve(false);
      slots.set(key, after);
      return Promise.resolve(true);
    },
  }, scope, captureSessionGuard());
  await vault.unlock(revealViewingKey());
  const invoiceDigest = '0x' + '02'.repeat(32);
  await vault.registerInvoice({ version: 1, invoiceDigest, nonce: 'ef'.repeat(16), chainId: VECTOR_CHAIN, asset: 'native',
    expectedNetMinorUnits: '100', createdAt: 100, expiresAt: 200, registeredAt: 120_000 });
  await vault.archiveReceipt(signReceipt({ invoiceDigest, chainId: VECTOR_CHAIN, txHash: hash, asset: 'native',
    amountMinorUnits: '100', issuedAt: 150 }, new Uint8Array(32).fill(0x33)), 180_000);
  for (const category of ['invoice-registration-timestamps', 'receipt-archive-timestamps'] as const) {
    const plan = await vault.previewTimestampCleanup(category, 30);
    expect(plan.count).toBe(1);
    await vault.confirmTimestampCleanup(plan);
  }
  expect(await vault.readState()).toMatchObject({ invoices: [{ registeredAt: null }], receipts: [{ archivedAt: null }] });
  vault.lock();
  clearSession();
  expect((await importKeystore(backup, passphrase)).metaAddress).toBe(seller.metaAddress);
  const file = await exportRawPrivateKey(match, { kind: 'keystore', text: backup, passphrase }, true, { rpc: codeRpc() });
  expect(file.text).toEqual(VECTORS.files.rawPrivateKey.text);
  expect(readAttempts(journal)).toEqual(attempts);
});
