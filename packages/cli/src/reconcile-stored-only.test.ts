import { expect, it } from 'vitest';
import { createInvoice } from '@ghostpay/invoice-schema';
import { createReconciliationApi } from '@ghostpay/ux-vault/portable';
import { run } from './run.js';
import { MemoryReconciliationStore } from './backup-data.js';
import { NOW, SIGNER, SPEC, counterRandom, stdoutJson } from './fixtures.testutil.js';
import { BLOCK } from './payment-fixtures.testutil.js';
import { reconciliationWorld, RECON_CREDS, RECON_LIVE, SELLER_ID, VIEW_HEX } from './reconciliation-fixtures.testutil.js';

const api = createReconciliationApi();

/** A stored verified-at-scan record that exactly matches a registered invoice but is absent from current.json. */
async function worldWithStoredOnlyRecord() {
  const w = await reconciliationWorld();
  const vault = new api.ReconciliationVault(new MemoryReconciliationStore(w.io.files.get('history.json')), { sellerKeyId: SELLER_ID, chainId: 11155111 }, () => undefined, () => NOW * 1000);
  await vault.unlock(Uint8Array.from(Buffer.from(VIEW_HEX, 'hex')));
  await vault.clearInvoices();
  const invoice = createInvoice({ ...SPEC, chainId: 11155111, token: 'native', amountPolicy: { mode: 'fixed_token', tokenAmount: '300' }, signer: SIGNER }, counterRandom());
  await vault.registerInvoice(api.registrationFromInvoice(invoice, NOW * 1000));
  const tx = `0x${'ee'.repeat(32)}`;
  const stale = { version: 1, sellerKeyId: SELLER_ID, chainId: 11155111, transactionHash: tx, blockNumber: '100', blockHash: BLOCK, logIndex: 9, stealthAddress: w.recipient, asset: 'native', amountMinorUnits: '300', viewTagMatched: true, blockTimestamp: NOW.toString(), recordedAt: NOW * 1000, evidenceStatus: 'verified-at-scan', evidenceSource: 'verified-router-scan', id: `${SELLER_ID}:11155111:${tx}:${w.recipient}:${BLOCK}:9` } as const;
  await vault.save(stale);
  expect((await vault.proposals()).get(stale.id)?.kind).toBe('exact');
  w.io.files.set('history.json', await vault.exportEncrypted()); vault.lock();
  expect(w.io.files.get('current.json')).not.toContain('ee'.repeat(32));
  return { w, staleId: stale.id };
}

it('propose --out refuses a stored record that was not freshly verified in this run (R11-2)', async () => {
  const { w, staleId } = await worldWithStoredOnlyRecord();
  const code = await run(['reconcile', 'propose', '--in', 'history.json', ...RECON_CREDS, ...RECON_LIVE, '--record', staleId, '--out', 'proposal.json', '--json'], w.io);
  expect({ code, wrote: w.io.files.has('proposal.json'), claimsVerified: /"paymentVerifiedAtReview":true/.test(w.io.out.join('')) })
    .toEqual({ code: 1, wrote: false, claimsVerified: false });
  expect(JSON.parse(w.io.err.join(''))).toMatchObject({ ok: false, error: { code: 'CURRENT_EVIDENCE_REQUIRED' } });
});

it('propose listing reports a stored-only exact proposal as not currently verified (R11-2)', async () => {
  const { w, staleId } = await worldWithStoredOnlyRecord();
  expect(await run(['reconcile', 'propose', '--in', 'history.json', ...RECON_CREDS, ...RECON_LIVE, '--record', staleId, '--json'], w.io)).toBe(0);
  const report = stdoutJson(w.io) as { currentChainVerified: boolean; proposals: { recordId: string; kind: string; currentChainVerified: boolean }[] };
  expect(report.currentChainVerified).toBe(false);
  expect(report.proposals).toEqual([expect.objectContaining({ recordId: staleId, kind: 'exact', currentChainVerified: false })]);

  // Without --record, the freshly verified record is marked verified and the stored-only one is not.
  w.io.out.length = 0;
  expect(await run(['reconcile', 'propose', '--in', 'history.json', ...RECON_CREDS, ...RECON_LIVE, '--json'], w.io)).toBe(0);
  const all = stdoutJson(w.io) as typeof report;
  expect(all.currentChainVerified).toBe(false);
  expect(all.proposals.find((p) => p.recordId === staleId)?.currentChainVerified).toBe(false);
  expect(all.proposals.find((p) => p.recordId === w.recordId)?.currentChainVerified).toBe(true);
});

it('propose listing still reports a freshly verified record as currently verified (R11-2)', async () => {
  const w = await reconciliationWorld();
  expect(await run(['reconcile', 'propose', '--in', 'history.json', ...RECON_CREDS, ...RECON_LIVE, '--record', w.recordId, '--json'], w.io)).toBe(0);
  expect(stdoutJson(w.io)).toMatchObject({ currentChainVerified: true, proposals: [expect.objectContaining({ recordId: w.recordId, kind: 'exact', currentChainVerified: true })] });
});

it('offline propose listing never marks a stored proposal as currently verified (R11-2)', async () => {
  const { w, staleId } = await worldWithStoredOnlyRecord();
  expect(await run(['reconcile', 'propose', '--in', 'history.json', '--viewing-key-file', 'view.hex', '--json'], w.io)).toBe(0);
  expect(stdoutJson(w.io)).toMatchObject({ currentChainVerified: false, proposals: [expect.objectContaining({ recordId: staleId, kind: 'exact', currentChainVerified: false })] });
});
