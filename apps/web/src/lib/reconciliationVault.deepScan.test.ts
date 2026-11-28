import { routerNet } from '@ghostpay/chain-adapters';
import { describe, expect, it, vi } from 'vitest';
import type { ReconciliationRecord } from './reconciliationLedger';
import { registrationFromInvoice } from './reconciliationMatch';
import { NOW, testInvoice } from './reconciliationMatch.testutil';
import { ReconciliationVault, type ReconciliationVaultStore } from './reconciliationVault';

// A payment found only by the opt-in deep scan (wrong view tag) cannot be seen by a normal scan: its absence from a
// normal page is no evidence about it. Everything the page can still check about it (block hash, depth) keeps applying.

class Store implements ReconciliationVaultStore {
  readonly data = new Map<string, string>();
  read(key: string): Promise<string | null> { return Promise.resolve(this.data.get(key) ?? null); }
  compareAndSwap(key: string, expected: string | null, next: string, guard: () => void): Promise<boolean> {
    guard();
    if ((this.data.get(key) ?? null) !== expected) return Promise.resolve(false);
    this.data.set(key, next);
    return Promise.resolve(true);
  }
}

const scope = { sellerKeyId: 'a'.repeat(64), chainId: 84532 };
const blockHash = `0x${'c'.repeat(64)}`;
function payment(viewTagMatched: boolean): ReconciliationRecord {
  const transactionHash = `0x${'1'.repeat(64)}`;
  const stealthAddress = `0x${'d'.repeat(40)}`;
  return {
    version: 1, sellerKeyId: scope.sellerKeyId, chainId: scope.chainId, transactionHash, blockHash, blockNumber: '101',
    blockTimestamp: String(NOW + 60), stealthAddress, logIndex: 0, asset: 'native', amountMinorUnits: routerNet(1_000_000n).toString(),
    viewTagMatched, recordedAt: (NOW + 60) * 1000, evidenceStatus: 'verified-at-scan', evidenceSource: 'verified-router-scan',
    id: `${scope.sellerKeyId}:${scope.chainId}:${transactionHash}:${stealthAddress}:${blockHash}:0`,
  };
}

async function linked(viewTagMatched: boolean): Promise<ReconciliationVault> {
  const vault = new ReconciliationVault(new Store(), scope, () => undefined, () => (NOW + 7200) * 1000);
  await vault.unlock(new Uint8Array(32).fill(7));
  const invoice = registrationFromInvoice(testInvoice(), 1);
  await vault.registerInvoice(invoice);
  await vault.confirmProposal(payment(viewTagMatched), invoice.invoiceDigest);
  return vault;
}

function page(overrides: { readonly deep?: boolean; readonly finalizedThrough?: bigint; readonly canonicalHash?: () => Promise<string> } = {}) {
  return { from: 100n, through: 200n, finalizedThrough: 200n, resumed: false, canonicalHash: () => Promise.resolve(blockHash), retryFrom: vi.fn<(height: bigint) => void>(), ...overrides };
}

async function observeNothing(vault: ReconciliationVault, shown: ReturnType<typeof page>): Promise<string | undefined> {
  await vault.observeInvoicePayments([], undefined, shown);
  return (await vault.read())[0]?.evidenceStatus;
}

describe('a linked payment with a wrong view tag, on a page that does not report it', () => {
  it('stays verified on a normal scan while its block is still canonical and deep enough', async () => {
    const shown = page({ deep: false });
    expect(await observeNothing(await linked(false), shown)).toBe('verified-at-scan');
    expect(shown.retryFrom).not.toHaveBeenCalled();
  });

  it('is invalidated for good when its block was replaced', async () => {
    const vault = await linked(false);
    expect(await observeNothing(vault, page({ deep: false, canonicalHash: () => Promise.resolve(`0x${'e'.repeat(64)}`) }))).toBe('invalidated-after-reorg');
    await expect(vault.save(payment(false))).rejects.toThrow(/reorg/);
  });

  it('loses verification when the canonical block cannot be confirmed', async () => {
    const shown = page({ deep: false, canonicalHash: () => Promise.reject(new Error('providers disagree')) });
    expect(await observeNothing(await linked(false), shown)).toBe('unverified-at-scan');
    expect(shown.retryFrom).toHaveBeenCalledWith(101n);
  });

  it('loses verification below the finality depth', async () => {
    const shown = page({ deep: false, finalizedThrough: 100n });
    expect(await observeNothing(await linked(false), shown)).toBe('unverified-at-scan');
    expect(shown.retryFrom).toHaveBeenCalledWith(101n);
  });

  it.each([['a deep scan', { deep: true }], ['a page that does not say how it scanned', {}]] as const)(
    'loses verification on %s', async (_name, how) => {
      const shown = page(how);
      expect(await observeNothing(await linked(false), shown)).toBe('unverified-at-scan');
      expect(shown.retryFrom).toHaveBeenCalledWith(101n);
    },
  );

  it('keeps the old rule for a payment a normal scan can see', async () => {
    expect(await observeNothing(await linked(true), page({ deep: false }))).toBe('unverified-at-scan');
  });

  it('keeps the old rule for a payment that was never verified', async () => {
    const vault = new ReconciliationVault(new Store(), scope, () => undefined, () => (NOW + 7200) * 1000);
    await vault.unlock(new Uint8Array(32).fill(7));
    await vault.registerInvoice(registrationFromInvoice(testInvoice(), 1));
    await vault.observeInvoicePayments([{ ...payment(false), evidenceStatus: 'pending-at-scan', evidenceSource: 'router-scan-candidate' }]);
    expect((await vault.read())[0]?.evidenceStatus).toBe('pending-at-scan');
    expect(await observeNothing(vault, page({ deep: false }))).toBe('unverified-at-scan');
  });

  it('does not restore verification that was already lost', async () => {
    const vault = await linked(false);
    await observeNothing(vault, page({ deep: true }));
    const shown = page({ deep: false });
    expect(await observeNothing(vault, shown)).toBe('unverified-at-scan');
    expect(shown.retryFrom).toHaveBeenCalledWith(101n);
  });
});
