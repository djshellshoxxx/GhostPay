import { createCipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { routerNet } from '@ghostpay/chain-adapters';
import { describe, expect, it } from 'vitest';
import type { ReconciliationRecord } from './reconciliationLedger';
import { registrationFromInvoice, type RegisteredInvoice } from './reconciliationMatch';
import { NOW, testInvoice } from './reconciliationMatch.testutil';
import { signReceipt, type SignedReceipt } from './receipts';
import {
  MAX_ARCHIVED_RECEIPTS,
  ReconciliationVault,
  type ReconciliationVaultStore,
} from './reconciliationVault';
import { MAX_REGISTERED_INVOICES } from './reconciliationMatch';

class Store implements ReconciliationVaultStore {
  readonly data = new Map<string, string>();
  read(key: string): Promise<string | null> {
    return Promise.resolve(this.data.get(key) ?? null);
  }
  compareAndSwap(key: string, expected: string | null, next: string, guard: () => void): Promise<boolean> {
    guard();
    if ((this.data.get(key) ?? null) !== expected) return Promise.resolve(false);
    this.data.set(key, next);
    return Promise.resolve(true);
  }
}
const scope = { sellerKeyId: 'a'.repeat(64), chainId: 84532 };
function rec(n: number, overrides: Partial<ReconciliationRecord> = {}): ReconciliationRecord {
  const tx = `0x${n.toString(16).padStart(64, '0')}`;
  const base = {
    version: 1 as const,
    sellerKeyId: scope.sellerKeyId,
    chainId: scope.chainId,
    transactionHash: tx,
    blockHash: `0x${'c'.repeat(64)}`,
    blockNumber: String(100 + n),
    stealthAddress: `0x${'d'.repeat(40)}`,
    logIndex: 0,
    asset: 'native',
    amountMinorUnits: routerNet(1_000_000n).toString(),
    viewTagMatched: true,
    recordedAt: (NOW + 60) * 1000,
    evidenceStatus: 'verified-at-scan' as const,
    evidenceSource: 'verified-router-scan' as const,
    ...overrides,
  };
  return { ...base, id: `${scope.sellerKeyId}:${base.chainId}:${tx}:${base.stealthAddress}:${base.blockHash}:0` };
}
async function unlocked(store = new Store(), guard = (): void => undefined): Promise<ReconciliationVault> {
  const vault = new ReconciliationVault(store, scope, guard);
  await vault.unlock(new Uint8Array(32).fill(7));
  return vault;
}
function encryptBody(template: string, body: unknown): string {
  const { ciphertext, ...header } = JSON.parse(template) as Record<string, unknown>;
  void ciphertext;
  header.iv = randomBytes(12).toString('hex');
  const key = hkdfSync('sha256', Buffer.alloc(32, 7), Buffer.from(header.salt as string, 'hex'), `GhostPay/reconciliation/v1/aes-gcm|${scope.sellerKeyId}:${scope.chainId}`, 32);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(key), Buffer.from(header.iv as string, 'hex'));
  cipher.setAAD(Buffer.from(JSON.stringify(header)));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(body)), cipher.final(), cipher.getAuthTag()]);
  return JSON.stringify({ ...header, ciphertext: encrypted.toString('hex') });
}
const signingKey = new Uint8Array(32).fill(9);
function receiptFor(record: ReconciliationRecord, invoiceDigest: string, chainId = scope.chainId): SignedReceipt {
  return signReceipt({ invoiceDigest, chainId, txHash: record.transactionHash, stealthAddress: record.stealthAddress, asset: record.asset, amountMinorUnits: record.amountMinorUnits, issuedAt: NOW + 120 }, signingKey);
}
function synthetic(n: number): RegisteredInvoice {
  return { ...registrationFromInvoice(testInvoice(), 1), invoiceDigest: `0x${n.toString(16).padStart(64, '0')}`, nonce: n.toString(16).padStart(32, '0') };
}
function doc(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { version: 2, records: [], invalidatedFrom: null, tombstones: [], saturated: false, invoices: [], receipts: [], ...overrides };
}

describe('encrypted invoice registration and local matching', () => {
  it('stores minimized registrations as ciphertext, deduplicates and rejects nonce collisions and foreign chains', async () => {
    const store = new Store();
    const vault = await unlocked(store);
    const invoice = registrationFromInvoice(testInvoice(), 1);
    await vault.registerInvoice(invoice);
    await vault.registerInvoice(invoice);
    expect((await vault.readState()).invoices).toEqual([invoice]);
    expect([...store.data.values()][0]).not.toContain(invoice.invoiceDigest.slice(2));
    await expect(vault.registerInvoice({ ...invoice, invoiceDigest: `0x${'e'.repeat(64)}` })).rejects.toThrow(/nonce/);
    await expect(vault.registerInvoice({ ...invoice, chainId: 1 })).rejects.toThrow(/scope/);
    await expect(vault.registerInvoice({ ...invoice, extra: 1 } as unknown as RegisteredInvoice)).rejects.toThrow(/registered invoice/);
    await vault.removeInvoice(invoice.invoiceDigest);
    expect((await vault.readState()).invoices).toEqual([]);
    await vault.registerInvoice(invoice);
    await vault.clearInvoices();
    expect((await vault.readState()).invoices).toEqual([]);
  });

  it('bounds registrations atomically', async () => {
    const store = new Store();
    const vault = await unlocked(store);
    const template = await vault.exportEncrypted();
    store.data.set(`${scope.sellerKeyId}:${scope.chainId}`, encryptBody(template, doc({ invoices: Array.from({ length: MAX_REGISTERED_INVOICES }, (_, i) => synthetic(i + 1)) })));
    expect((await vault.readState()).invoices).toHaveLength(MAX_REGISTERED_INVOICES);
    const before = [...store.data.values()][0];
    await expect(vault.registerInvoice(synthetic(MAX_REGISTERED_INVOICES + 1))).rejects.toThrow(/At most 500 invoices/);
    expect([...store.data.values()][0]).toBe(before);
    store.data.set(`${scope.sellerKeyId}:${scope.chainId}`, encryptBody(template, doc({ invoices: Array.from({ length: MAX_REGISTERED_INVOICES + 1 }, (_, i) => synthetic(i + 1)) })));
    await expect(vault.readState()).rejects.toThrow(/limit/);
  });

  it('proposes and confirms only exact pairs, rechecked inside the encrypted write', async () => {
    const vault = await unlocked();
    const invoice = registrationFromInvoice(testInvoice(), 1);
    await vault.registerInvoice(invoice);
    const current = rec(1);
    expect((await vault.proposals([current])).get(current.id)).toEqual({ kind: 'exact', invoice });
    await vault.save(rec(9, { amountMinorUnits: '5' }));
    await vault.confirmProposal(current, invoice.invoiceDigest);
    const state = await vault.readState();
    expect(state.records[0]).toMatchObject({ id: rec(9).id });
    expect(state.records.find((r) => r.id === current.id)).toMatchObject({ id: current.id, invoiceDigest: invoice.invoiceDigest, provenance: 'live-scan' });
    // The linked invoice is no longer offered and the linked record cannot be re-linked.
    expect((await vault.proposals([rec(2)])).get(rec(2).id)).toEqual({ kind: 'none' });
    await expect(vault.confirmProposal(state.records.find((r) => r.id === current.id)!, invoice.invoiceDigest)).rejects.toThrow(/unlinked/);
    await expect(vault.confirmProposal(rec(2), invoice.invoiceDigest)).rejects.toThrow(/no longer has a single exact/);
    await expect(vault.confirmProposal({ ...rec(4), provenance: 'imported-history' }, invoice.invoiceDigest)).rejects.toThrow(/Imported history/);
    await expect(vault.confirmProposal({ ...rec(3), chainId: 1, id: rec(3).id.replace(':84532:', ':1:') }, invoice.invoiceDigest)).rejects.toThrow(/scope/);
  });

  it('never confirms ambiguous proposals', async () => {
    const vault = await unlocked();
    const a = registrationFromInvoice(testInvoice(), 1);
    const b = registrationFromInvoice(testInvoice(), 1);
    await vault.registerInvoice(a);
    await vault.registerInvoice(b);
    expect((await vault.proposals([rec(1)])).get(rec(1).id)).toMatchObject({ kind: 'ambiguous', reason: 'multiple-invoices' });
    await expect(vault.confirmProposal(rec(1), a.invoiceDigest)).rejects.toThrow(/no longer has a single exact/);
    expect((await vault.readState()).records).toEqual([]);
    await vault.removeInvoice(b.invoiceDigest);
    await vault.save(rec(1));
    // A second stored payment of the same amount makes the single invoice ambiguous.
    await vault.save(rec(2));
    expect((await vault.proposals()).get(rec(1).id)).toMatchObject({ kind: 'ambiguous', reason: 'multiple-payments' });
    await expect(vault.confirmProposal(rec(1), a.invoiceDigest)).rejects.toThrow(/no longer has a single exact/);
  });

  it('reopens an invoice after reorg invalidation and refuses to link invalidated observations', async () => {
    const vault = await unlocked();
    const invoice = registrationFromInvoice(testInvoice(), 1);
    await vault.registerInvoice(invoice);
    await vault.confirmProposal(rec(1), invoice.invoiceDigest);
    await vault.invalidateFrom(101n);
    const state = await vault.readState();
    expect(state.records[0]?.evidenceStatus).toBe('invalidated-after-reorg');
    expect(state.invoices).toEqual([invoice]);
    await expect(vault.confirmProposal(rec(1), invoice.invoiceDigest)).rejects.toThrow(/invalidated/);
    const fresh = rec(5, { blockNumber: '99' });
    expect((await vault.proposals([fresh])).get(fresh.id)).toEqual({ kind: 'exact', invoice });
  });

  it('keeps saturated vaults read-only for registration, matching and archiving while allowing deletion', async () => {
    const store = new Store();
    const vault = await unlocked(store);
    const invoice = registrationFromInvoice(testInvoice(), 1);
    const receipt = receiptFor(rec(1), invoice.invoiceDigest);
    const template = await vault.exportEncrypted();
    store.data.set(`${scope.sellerKeyId}:${scope.chainId}`, encryptBody(template, doc({ saturated: true, invoices: [invoice], receipts: [{ receipt, archivedAt: 1 }] })));
    await expect(vault.registerInvoice(synthetic(9))).rejects.toThrow(/read-only/);
    await expect(vault.confirmProposal(rec(1), invoice.invoiceDigest)).rejects.toThrow(/read-only/);
    await expect(vault.archiveReceipt(receiptFor(rec(2), invoice.invoiceDigest))).rejects.toThrow(/read-only/);
    await vault.removeReceipt(receipt.signature);
    await vault.removeInvoice(invoice.invoiceDigest);
    expect(await vault.readState()).toEqual({ records: [], readOnly: true, invoices: [], receipts: [] });
  });

  it('rejects stale sessions during registration without writing', async () => {
    const store = new Store();
    let current = true;
    const vault = await unlocked(store, () => {
      if (!current) throw new Error('Session changed.');
    });
    current = false;
    await expect(vault.registerInvoice(registrationFromInvoice(testInvoice(), 1))).rejects.toThrow(/Session changed/);
    current = true;
    const pending = vault.registerInvoice(registrationFromInvoice(testInvoice(), 1));
    vault.lock();
    await expect(pending).rejects.toThrow(/locked|stale/);
    expect(store.data.size).toBe(0);
  });

  it('reads version 1 documents with empty registrations and upgrades them on write', async () => {
    const store = new Store();
    const vault = await unlocked(store);
    const template = await vault.exportEncrypted();
    const { id, ...rest } = rec(1);
    void id;
    const v1 = { version: 1, records: [{ ...rest, id: rec(1).id, provenance: 'live-scan' }], invalidatedFrom: null, tombstones: [], saturated: false };
    store.data.set(`${scope.sellerKeyId}:${scope.chainId}`, encryptBody(template, v1));
    expect((await vault.readState())).toMatchObject({ invoices: [], receipts: [], records: [{ id: rec(1).id }] });
    await vault.registerInvoice(registrationFromInvoice(testInvoice(), 1));
    expect((await vault.readState()).records).toHaveLength(1);
  });

  it('rejects malformed registrations and receipts in decrypted documents', async () => {
    const vault = await unlocked();
    const template = await vault.exportEncrypted();
    const invoice = registrationFromInvoice(testInvoice(), 1);
    const receipt = receiptFor(rec(1), invoice.invoiceDigest);
    const bad = [
      doc({ invoices: [invoice, invoice] }),
      doc({ invoices: [invoice, { ...synthetic(3), nonce: invoice.nonce }] }),
      doc({ invoices: [{ ...invoice, chainId: 1 }] }),
      doc({ invoices: 'x' }),
      doc({ receipts: 'x' }),
      doc({ receipts: [{ receipt, archivedAt: 1 }, { receipt, archivedAt: 2 }] }),
      doc({ receipts: [{ receipt, archivedAt: 0 }] }),
      doc({ receipts: [{ receipt: { ...receipt, signature: 'zz' }, archivedAt: 1 }] }),
      doc({ receipts: [{ receipt: { ...receipt, chainId: 0 }, archivedAt: 1 }] }),
      doc({ receipts: [{ receipt: receiptFor(rec(1), invoice.invoiceDigest, 1), archivedAt: 1 }] }),
      doc({ receipts: [{ receipt, archivedAt: 1, extra: 1 }] }),
      doc({ receipts: [{ receipt: 'x', archivedAt: 1 }] }),
      doc({ receipts: Array.from({ length: MAX_ARCHIVED_RECEIPTS + 1 }, () => ({ receipt, archivedAt: 1 })) }),
      { ...doc(), version: 3 },
      { version: 1, records: [], invalidatedFrom: null, tombstones: [], saturated: false, invoices: [] },
    ];
    for (const body of bad) await expect(vault.previewImport(encryptBody(template, body))).rejects.toThrow(/invoice|receipt|document|scope|limit/i);
  });
});

describe('encrypted seller receipt archive', () => {
  it('archives valid receipts once, exports them on request and deletes them', async () => {
    const store = new Store();
    const vault = await unlocked(store);
    const invoice = registrationFromInvoice(testInvoice(), 1);
    const receipt = receiptFor(rec(1), invoice.invoiceDigest);
    await vault.archiveReceipt(receipt, 7);
    await vault.archiveReceipt(receipt, 8);
    expect((await vault.readState()).receipts).toEqual([{ receipt, archivedAt: 7 }]);
    expect([...store.data.values()][0]).not.toContain(receipt.signature);
    const exported = JSON.parse(await vault.exportReceipts()) as unknown[];
    expect(exported).toEqual([receipt]);
    const second = receiptFor(rec(2), invoice.invoiceDigest);
    await vault.archiveReceipt(second, 9);
    await vault.removeReceipt(receipt.signature);
    expect((await vault.readState()).receipts).toEqual([{ receipt: second, archivedAt: 9 }]);
    await vault.clearReceipts();
    expect(await vault.exportReceipts()).toBe('[]');
  });

  it('refuses tampered or foreign-chain receipts and enforces the archive bound', async () => {
    const store = new Store();
    const vault = await unlocked(store);
    const receipt = receiptFor(rec(1), `0x${'1'.repeat(64)}`);
    await expect(vault.archiveReceipt({ ...receipt, amountMinorUnits: '1' })).rejects.toThrow(/valid signed receipt/);
    await expect(vault.archiveReceipt(receiptFor(rec(1), `0x${'1'.repeat(64)}`, 1))).rejects.toThrow(/scope/);
    const template = await vault.exportEncrypted();
    const filler = Array.from({ length: MAX_ARCHIVED_RECEIPTS }, (_, i) => ({ receipt: { ...receipt, signature: i.toString(16).padStart(128, '0') }, archivedAt: 1 }));
    store.data.set(`${scope.sellerKeyId}:${scope.chainId}`, encryptBody(template, doc({ receipts: filler })));
    await expect(vault.archiveReceipt(receipt)).rejects.toThrow(/At most 500 receipts/);
  });

  it('never treats an archived receipt as payment evidence or as an invoice link', async () => {
    const vault = await unlocked();
    const invoice = registrationFromInvoice(testInvoice(), 1);
    await vault.registerInvoice(invoice);
    await vault.archiveReceipt(receiptFor(rec(1), invoice.invoiceDigest));
    const state = await vault.readState();
    expect(state.records).toEqual([]);
    // Another payment of the same amount is still proposed: the receipt claims nothing.
    expect((await vault.proposals([rec(2)])).get(rec(2).id)).toEqual({ kind: 'exact', invoice });
  });
});

describe('encrypted backups with registrations and receipts', () => {
  it('previews counts and merges by identity, keeping the local registration on nonce conflicts', async () => {
    const source = await unlocked();
    const invoice = registrationFromInvoice(testInvoice(), 1);
    const receipt = receiptFor(rec(1), invoice.invoiceDigest);
    await source.registerInvoice(invoice);
    await source.archiveReceipt(receipt, 3);
    const target = await unlocked();
    const local = { ...synthetic(77), nonce: invoice.nonce };
    await target.registerInvoice(local);
    await target.archiveReceipt(receipt, 4);
    const preview = await target.previewImport(await source.exportEncrypted());
    expect(preview).toMatchObject({ invoiceCount: 1, receiptCount: 1 });
    await target.activateImport(preview);
    const state = await target.readState();
    expect(state.invoices).toEqual([local]);
    expect(state.receipts).toEqual([{ receipt, archivedAt: 4 }]);
    const fresh = await unlocked();
    await fresh.activateImport(await fresh.previewImport(await source.exportEncrypted()));
    expect((await fresh.readState()).invoices).toEqual([invoice]);
  });

  it('refuses imports that would exceed the registration or archive bounds', async () => {
    const store = new Store();
    const target = await unlocked(store);
    const template = await target.exportEncrypted();
    store.data.set(`${scope.sellerKeyId}:${scope.chainId}`, encryptBody(template, doc({ invoices: Array.from({ length: MAX_REGISTERED_INVOICES }, (_, i) => synthetic(i + 1)) })));
    const backup = encryptBody(template, doc({ invoices: [synthetic(MAX_REGISTERED_INVOICES + 5)] }));
    await expect(target.activateImport(await target.previewImport(backup))).rejects.toThrow(/would exceed/);
  });
});
