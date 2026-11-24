import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { signReceipt } from '@ghostpay/invoice-schema';
import { createReconciliationApi, type Document, type Envelope, type RegisteredInvoice, type ReconciliationVaultStore, type VaultRecord } from './reconciliation-portable.js';
import { summarizeInvoicePayments } from './reconciliation-amounts.js';

const { ReconciliationVault, validateRegisteredInvoice, proposeInvoiceMatch } = createReconciliationApi();
const scope = { sellerKeyId: 'a'.repeat(64), chainId: 84532 };
const slot = `${scope.sellerKeyId}:${scope.chainId}`;
const viewingKey = new Uint8Array(32).fill(7);
class Store implements ReconciliationVaultStore {
  readonly data = new Map<string, string>();
  writes = 0;
  beforeWrite: (() => void | Promise<void>) | undefined;
  refuse = false;
  read(key: string): Promise<string | null> { return Promise.resolve(this.data.get(key) ?? null); }
  async compareAndSwap(key: string, expected: string | null, next: string, guard: () => void): Promise<boolean> {
    this.writes++;
    await this.beforeWrite?.();
    guard();
    if (this.refuse || (this.data.get(key) ?? null) !== expected) return false;
    this.data.set(key, next);
    return true;
  }
}
function invoice(n = 1): RegisteredInvoice {
  return { version: 1, invoiceDigest: `0x${n.toString(16).padStart(64, '0')}`, nonce: n.toString(16).padStart(32, '0'),
    chainId: scope.chainId, asset: 'native', expectedNetMinorUnits: '100', createdAt: 1_000, expiresAt: 2_000, registeredAt: 1_500_000 + n };
}
function record(n = 1): VaultRecord {
  const item = { version: 1 as const, ...scope, transactionHash: `0x${n.toString(16).padStart(64, '0')}`,
    blockNumber: '100', blockHash: `0x${'d'.repeat(64)}`, blockTimestamp: '1500', logIndex: n,
    stealthAddress: `0x${'e'.repeat(40)}`, asset: 'native', amountMinorUnits: '100', viewTagMatched: true,
    recordedAt: 1_600_000, evidenceStatus: 'verified-at-scan' as const, evidenceSource: 'verified-router-scan' as const,
    provenance: 'live-scan' as const };
  return { ...item, id: `${item.sellerKeyId}:${item.chainId}:${item.transactionHash}:${item.stealthAddress}:${item.blockHash}:${item.logIndex}` };
}
function document(): Document {
  const payment = record();
  const receipt = signReceipt({ invoiceDigest: invoice().invoiceDigest, chainId: scope.chainId, txHash: payment.transactionHash,
    stealthAddress: payment.stealthAddress, asset: payment.asset, amountMinorUnits: payment.amountMinorUnits, issuedAt: 1_700 }, new Uint8Array(32).fill(9));
  return { version: 3, records: [payment], invoices: [invoice(), invoice(2)], receipts: [{ receipt, archivedAt: 1_800_000 }],
    invalidatedFrom: '90', invalidatedAt: 1_400_000, tombstones: [record(9).id], saturated: false };
}
function encrypt(body: unknown): string {
  const header = { format: 'ghostpay-reconciliation', version: 1, ...scope, salt: randomBytes(32).toString('hex'), iv: randomBytes(12).toString('hex') };
  const key = hkdfSync('sha256', viewingKey, Buffer.from(header.salt, 'hex'), `GhostPay/reconciliation/v1/aes-gcm|${slot}`, 32);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(key), Buffer.from(header.iv, 'hex'));
  cipher.setAAD(Buffer.from(JSON.stringify(header)));
  return JSON.stringify({ ...header, ciphertext: Buffer.concat([cipher.update(JSON.stringify(body)), cipher.final(), cipher.getAuthTag()]).toString('hex') });
}
function decrypt(text: string): Document {
  const { ciphertext, ...header } = JSON.parse(text) as Envelope;
  const key = hkdfSync('sha256', viewingKey, Buffer.from(header.salt, 'hex'), `GhostPay/reconciliation/v1/aes-gcm|${slot}`, 32);
  const bytes = Buffer.from(ciphertext, 'hex');
  const cipher = createDecipheriv('aes-256-gcm', Buffer.from(key), Buffer.from(header.iv, 'hex'));
  cipher.setAAD(Buffer.from(JSON.stringify(header)));
  cipher.setAuthTag(bytes.subarray(-16));
  return JSON.parse(Buffer.concat([cipher.update(bytes.subarray(0, -16)), cipher.final()]).toString()) as Document;
}
async function open(store = new Store(), guard = (): void => undefined, now = Date.now) {
  const vault = new ReconciliationVault(store, scope, guard, now);
  await vault.unlock(Uint8Array.from(viewingKey));
  return vault;
}

describe('explicit local invoice timestamp cleanup', () => {
  it('previews only a category/count, writes nothing on cancel, and consumes approval exactly once', async () => {
    const store = new Store(); store.data.set(slot, encrypt(document()));
    const before = store.data.get(slot);
    const vault = await open(store);
    const cancelled = await vault.previewInvoiceTimestampCleanup();
    expect(cancelled).toEqual({ category: 'invoice-registration-timestamps', count: 2 });
    expect(Object.isFrozen(cancelled)).toBe(true);
    expect(store.data.get(slot)).toBe(before);
    vault.cancelInvoiceTimestampCleanup(cancelled);
    await expect(vault.confirmInvoiceTimestampCleanup(cancelled)).rejects.toThrow();
    expect(store.writes).toBe(0);
    const approved = await vault.previewInvoiceTimestampCleanup();
    await expect(vault.confirmInvoiceTimestampCleanup({ ...approved })).rejects.toThrow();
    await vault.confirmInvoiceTimestampCleanup(approved);
    const after = store.data.get(slot);
    await expect(vault.confirmInvoiceTimestampCleanup(approved)).rejects.toThrow();
    expect(store.writes).toBe(1);
    expect(store.data.get(slot)).toBe(after);
  });

  it('changes only the explicit format and local save timestamps, preserving all protected records and summaries', async () => {
    const store = new Store(); const original = document(); store.data.set(slot, encrypt(original));
    store.data.set('unrelated-vault', 'existing encrypted bytes');
    const vault = await open(store);
    const proposal = proposeInvoiceMatch(record(), [invoice()], [record()]);
    const linked = [{ ...record(), invoiceDigest: invoice().invoiceDigest }, { ...record(2), invoiceDigest: invoice().invoiceDigest, amountMinorUnits: '40' }];
    const summary = summarizeInvoicePayments(invoice(), linked, scope);
    await vault.confirmInvoiceTimestampCleanup(await vault.previewInvoiceTimestampCleanup());
    const cleaned = decrypt(store.data.get(slot)!);
    expect(cleaned).toEqual({ ...original, version: 4, invoices: original.invoices.map((entry) => ({ ...entry, version: 2, registeredAt: null })) });
    const registered = cleaned.invoices[0]!;
    expect(summarizeInvoicePayments(registered, linked, scope)).toEqual(summary);
    expect(proposeInvoiceMatch(record(), [registered], [record()])).toEqual({ ...proposal, invoice: registered });
    expect(store.data.get('unrelated-vault')).toBe('existing encrypted bytes');
    expect(await vault.exportReceipts()).toContain(original.receipts[0]!.receipt.signature);
    expect((await vault.readState()).invoices).toEqual(cleaned.invoices);
  });

  it.each([1, 2, 3] as const)('reads supported document version %s without writing or inventing times', async (version) => {
    const original = document();
    const body = version === 1
      ? { version, records: original.records, invalidatedFrom: original.invalidatedFrom, tombstones: original.tombstones, saturated: false }
      : version === 2 ? { ...original, version, invalidatedAt: undefined } : original;
    const store = new Store(); store.data.set(slot, encrypt(body)); const before = store.data.get(slot);
    const vault = await open(store);
    expect((await vault.readState()).invoices).toEqual(version === 1 ? [] : original.invoices);
    expect((await vault.previewInvoiceTimestampCleanup()).count).toBe(version === 1 ? 0 : 2);
    expect(store.data.get(slot)).toBe(before);
    expect(store.writes).toBe(0);
  });

  it('does not create a vault or rewrite an already cleaned snapshot when there is nothing eligible', async () => {
    const store = new Store(); const vault = await open(store);
    await vault.confirmInvoiceTimestampCleanup(await vault.previewInvoiceTimestampCleanup());
    expect(store.data.size).toBe(0);
    await vault.registerInvoice({ ...invoice(), version: 2, registeredAt: null });
    const before = store.data.get(slot); const writes = store.writes;
    await vault.confirmInvoiceTimestampCleanup(await vault.previewInvoiceTimestampCleanup());
    expect(store.data.get(slot)).toBe(before);
    expect(store.writes).toBe(writes);
  });

  it('preserves previously removed times while cleaning a mixed current-format document', async () => {
    const original = document();
    const removed: RegisteredInvoice = { ...invoice(), version: 2, registeredAt: null };
    const mixed: Document = { ...original, version: 4, invoices: [removed, invoice(2)] };
    const store = new Store(); store.data.set(slot, encrypt(mixed));
    const vault = await open(store);
    const preview = await vault.previewInvoiceTimestampCleanup();
    expect(preview.count).toBe(1);
    await vault.confirmInvoiceTimestampCleanup(preview);
    expect(decrypt(store.data.get(slot)!)).toEqual({ ...mixed, invoices: [removed, { ...invoice(2), version: 2, registeredAt: null }] });
  });

  it('permits only one confirmation when the same approval is submitted concurrently', async () => {
    const store = new Store(); store.data.set(slot, encrypt(document())); const vault = await open(store);
    const preview = await vault.previewInvoiceTimestampCleanup();
    const results = await Promise.allSettled([vault.confirmInvoiceTimestampCleanup(preview), vault.confirmInvoiceTimestampCleanup(preview)]);
    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected']);
    expect(store.writes).toBe(1);
  });

  it('rejects a preview after another handle changes storage and never extends it onto newly registered invoices', async () => {
    const store = new Store(); store.data.set(slot, encrypt(document()));
    const vault = await open(store); const other = await open(store);
    const preview = await vault.previewInvoiceTimestampCleanup();
    await other.registerInvoice(invoice(3));
    const concurrent = store.data.get(slot); const writes = store.writes;
    await expect(vault.confirmInvoiceTimestampCleanup(preview)).rejects.toThrow();
    expect(store.data.get(slot)).toBe(concurrent);
    expect(store.writes).toBe(writes);
    expect((await other.readState()).invoices.every((entry) => entry.registeredAt !== null)).toBe(true);
  });

  it('uses one CAS attempt and consumes a failed or denied write without retrying', async () => {
    for (const failure of ['changed', 'denied'] as const) {
      const store = new Store(); store.data.set(slot, encrypt(document())); const vault = await open(store);
      const preview = await vault.previewInvoiceTimestampCleanup();
      const concurrent = encrypt({ ...document(), invoices: [...document().invoices, invoice(3)] });
      store.beforeWrite = () => { if (failure === 'denied') throw new Error('storage unavailable'); store.data.set(slot, concurrent); };
      await expect(vault.confirmInvoiceTimestampCleanup(preview)).rejects.toThrow();
      expect(store.writes).toBe(1);
      const after = store.data.get(slot);
      await expect(vault.confirmInvoiceTimestampCleanup(preview)).rejects.toThrow();
      expect(store.writes).toBe(1);
      expect(store.data.get(slot)).toBe(after);
      expect(decrypt(after!).invoices.every((entry) => entry.registeredAt !== null)).toBe(true);
    }
  });

  it('rejects replay, another handle, lock and same-key reinstallation without writes', async () => {
    const store = new Store(); store.data.set(slot, encrypt(document())); const vault = await open(store);
    const preview = await vault.previewInvoiceTimestampCleanup();
    const other = await open(store);
    await expect(other.confirmInvoiceTimestampCleanup(preview)).rejects.toThrow();
    vault.lock();
    await vault.unlock(Uint8Array.from(viewingKey));
    await expect(vault.confirmInvoiceTimestampCleanup(preview)).rejects.toThrow();
    const again = await vault.previewInvoiceTimestampCleanup();
    await vault.unlock(Uint8Array.from(viewingKey));
    await expect(vault.confirmInvoiceTimestampCleanup(again)).rejects.toThrow();
    expect(store.writes).toBe(0);
  });

  it('checks session and caller authority again inside the storage transaction', async () => {
    for (const boundary of ['session', 'caller', 'lock'] as const) {
      const store = new Store(); store.data.set(slot, encrypt(document())); const before = store.data.get(slot);
      let session = true; let caller = true;
      const vault = await open(store, () => { if (!session) throw new Error('session replaced'); });
      const preview = await vault.previewInvoiceTimestampCleanup();
      store.beforeWrite = () => { if (boundary === 'session') session = false; else if (boundary === 'caller') caller = false; else vault.lock(); };
      await expect(vault.confirmInvoiceTimestampCleanup(preview, () => { if (!caller) throw new Error('consent revoked'); })).rejects.toThrow();
      expect(store.data.get(slot)).toBe(before);
      expect(store.writes).toBe(1);
    }
  });

  it('preserves removal through reload, duplicate registration, old-backup import and new-backup transfer', async () => {
    const store = new Store(); const old = document(); store.data.set(slot, encrypt(old));
    let vault = await open(store); await vault.confirmInvoiceTimestampCleanup(await vault.previewInvoiceTimestampCleanup());
    const cleaned = (await vault.readState()).invoices;
    vault.lock(); vault = await open(store);
    await vault.registerInvoice(invoice());
    const olderBackup = encrypt({ ...old, invoices: [...old.invoices, invoice(3)] });
    await vault.activateImport(await vault.previewImport(olderBackup));
    expect((await vault.readState()).invoices).toEqual([...cleaned, invoice(3)]);
    const freshStore = new Store(); const fresh = await open(freshStore);
    await fresh.activateImport(await fresh.previewImport(await vault.exportEncrypted()));
    expect((await fresh.readState()).invoices).toEqual([...cleaned, invoice(3)]);
    expect(decrypt(freshStore.data.get(slot)!).version).toBe(4);
  });

  it('keeps future/unknown formats and read-only safety state unchanged', async () => {
    for (const body of [
      { ...document(), version: 6 },
      { ...document(), version: 4, receipts: [{ ...document().receipts[0], archivedAt: null }] },
      { ...document(), saturated: true },
      { ...document(), invoices: [{ ...invoice(), version: 2, registeredAt: null }] },
    ]) {
      const store = new Store(); store.data.set(slot, encrypt(body)); const before = store.data.get(slot); const vault = await open(store);
      await expect(vault.previewInvoiceTimestampCleanup()).rejects.toThrow();
      expect(store.data.get(slot)).toBe(before); expect(store.writes).toBe(0);
    }
  });

  it('accepts only the documented pairings of row version and removed-time representation', () => {
    expect(validateRegisteredInvoice({ ...invoice(), version: 2, registeredAt: null })).toEqual({ ...invoice(), version: 2, registeredAt: null });
    for (const changed of [{ version: 1, registeredAt: null }, { version: 2, registeredAt: 1 }, { version: 2, registeredAt: undefined }])
      expect(() => validateRegisteredInvoice({ ...invoice(), ...changed })).toThrow();
  });
});

describe('reviewed age policy for persistent invoice and payment metadata', () => {
  const receiptTimes = 'receipt-archive-timestamps';
  const invoiceTimes = 'invoice-registration-timestamps';
  const day = 86_400_000;

  it.each([0, 30, 90] as const)('binds each category to the inclusive %i-day cutoff at preview', async (days) => {
    let now = 100 * day;
    const cutoff = now - days * day;
    const original = document();
    const invoices = [1, 2, 3].map((n) => ({ ...invoice(n), version: 1 as const, registeredAt: cutoff + n - 2 }));
    const receipts = invoices.map(({ registeredAt }, n) => {
      const { signature, ...signed } = original.receipts[0]!.receipt;
      void signature;
      const receipt = signReceipt({ invoiceDigest: signed.invoiceDigest, chainId: signed.chainId, txHash: signed.txHash,
        asset: signed.asset, amountMinorUnits: signed.amountMinorUnits, issuedAt: 1700 + n },
      new Uint8Array(32).fill(9));
      return { receipt, archivedAt: registeredAt };
    });
    const store = new Store();
    store.data.set(slot, encrypt({ ...original, invoices, receipts }));
    const vault = await open(store, () => undefined, () => now);
    const before = await vault.exportReceipts();
    const plan = await vault.previewTimestampCleanup(receiptTimes, days);
    expect(plan).toEqual({ category: receiptTimes, count: 2 });
    now += day;
    await vault.confirmTimestampCleanup(plan);
    const redactedReceipts = receipts.map((r, i) => ({ ...r, archivedAt: i < 2 ? null : r.archivedAt }));
    expect(decrypt(store.data.get(slot)!)).toEqual({ ...original, invoices, version: 5, receipts: redactedReceipts });
    expect(await vault.exportReceipts()).toEqual(before);
    now -= day;
    const invoicePlan = await vault.previewTimestampCleanup(invoiceTimes, days);
    expect(invoicePlan.count).toBe(2);
    await vault.confirmTimestampCleanup(invoicePlan);
    const redactedInvoices = invoices.map((i, n) => n < 2 ? { ...i, version: 2, registeredAt: null } : i);
    expect(decrypt(store.data.get(slot)!)).toEqual({ ...original, version: 5, invoices: redactedInvoices, receipts: redactedReceipts });
  });

  it('preserves ciphertext on clock rollback, interrupted commit and a racing writer; each requires fresh approval', async () => {
    const store = new Store();
    store.data.set(slot, encrypt(document()));
    let now = 100 * day;
    const vault = await open(store, () => undefined, () => now);
    const bytes = await vault.exportEncrypted();
    let plan = await vault.previewTimestampCleanup(receiptTimes, 30);
    now--;
    await expect(vault.confirmTimestampCleanup(plan)).rejects.toThrow();
    expect(await vault.exportEncrypted()).toBe(bytes);
    plan = await vault.previewTimestampCleanup(receiptTimes, 30);
    store.beforeWrite = () => { throw new Error('aborted transaction'); };
    await expect(vault.confirmTimestampCleanup(plan)).rejects.toThrow('aborted transaction');
    store.beforeWrite = undefined;
    await expect(vault.confirmTimestampCleanup(plan)).rejects.toThrow();
    expect(await vault.exportEncrypted()).toBe(bytes);
    const other = await open(store);
    plan = await vault.previewTimestampCleanup(receiptTimes, 30);
    await other.registerInvoice(invoice(3));
    const newer = await other.exportEncrypted();
    await expect(vault.confirmTimestampCleanup(plan)).rejects.toThrow();
    expect(await vault.exportEncrypted()).toBe(newer);
    await vault.confirmTimestampCleanup(await vault.previewTimestampCleanup(receiptTimes, 30));
    vault.lock();
    const reopened = await open(store);
    expect((await reopened.readState()).receipts[0]?.archivedAt).toBeNull();
    expect((await reopened.readState()).invoices).toHaveLength(3);
    await reopened.activateImport(await reopened.previewImport(bytes));
    expect((await reopened.readState()).receipts[0]?.archivedAt).toBeNull();
    const restored = await open();
    await restored.activateImport(await restored.previewImport(await reopened.exportEncrypted()));
    expect(await restored.exportReceipts()).toBe(await reopened.exportReceipts());
    expect((await restored.readState()).receipts).toEqual((await reopened.readState()).receipts);
  });
});

it('announces a committed cleanup even when the caller loses consent before the storage promise resolves', async () => {
  const store = new Store();
  store.data.set(slot, encrypt(document()));
  let allowed = true;
  let notifications = 0;
  const api = createReconciliationApi({ notify: () => { notifications++; } });
  const vault = new api.ReconciliationVault({
    read: (key) => store.read(key),
    compareAndSwap: async (key, expected, next, guard) => {
      const committed = await store.compareAndSwap(key, expected, next, guard);
      allowed = false;
      return committed;
    },
  }, scope, () => undefined);
  await vault.unlock(Uint8Array.from(viewingKey));
  const plan = await vault.previewTimestampCleanup('receipt-archive-timestamps', 30);
  await vault.confirmTimestampCleanup(plan, () => { if (!allowed) throw new Error('revoked'); });
  expect(notifications).toBe(1);
  expect((await vault.readState()).receipts[0]?.archivedAt).toBeNull();
});
