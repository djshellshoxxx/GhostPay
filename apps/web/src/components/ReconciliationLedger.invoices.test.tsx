// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScanMatch } from '../lib/scanClient';
import { recordFromVerifiedMatch } from '../lib/reconciliationLedger';
import type { RegisteredInvoice } from '../lib/reconciliationMatch';
import { signReceipt } from '../lib/receipts';
import { clearSession, generateSession } from '../lib/session';
import { checkpointKeyId } from '../lib/scanClient';
import { ReconciliationVault, type ReconciliationVaultStore } from '../lib/reconciliationVault';
import { ReconciliationLedger } from './ReconciliationLedger';

const factory = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('../lib/reconciliationVault', async (original) => ({
  ...(await original<typeof import('../lib/reconciliationVault')>()),
  createCurrentReconciliationVault: factory.create,
}));
const BLOCK = `0x${'c'.repeat(64)}`;
const ADDRESS = `0x${'d'.repeat(40)}`;
function match(n = 1, amount = 2500000n): ScanMatch {
  const tx = `0x${n.toString(16).padStart(64, '0')}`;
  return {
    chainId: 84532,
    announcement: {
      id: `${BLOCK}:${n}`,
      transactionHash: tx,
      blockNumber: 120n,
      blockHash: BLOCK,
      logIndex: n,
      schemeId: 1n,
      caller: `0x${'1'.repeat(40)}`,
      stealthAddress: ADDRESS,
      ephemeralPublicKey: `0x02${'2'.repeat(64)}`,
      metadata: '0x',
    },
    stealthAddress: ADDRESS,
    metadata: { kind: 'native', token: '0x', netAmount: amount, viewTag: 5 },
    viaRouter: true,
    tagMatches: true,
    receipt: 'verified',
  } as unknown as ScanMatch;
}
const nowSeconds = Math.floor(Date.now() / 1000);
function invoice(n: number, net = '2500000'): RegisteredInvoice {
  return {
    version: 1,
    invoiceDigest: `0x${n.toString(16).padStart(64, '0')}`,
    nonce: n.toString(16).padStart(32, '0'),
    chainId: 84532,
    asset: 'native',
    expectedNetMinorUnits: net,
    createdAt: nowSeconds - 60,
    expiresAt: nowSeconds + 3600,
    registeredAt: Date.now(),
  };
}
let keyId: string;
let vault: ReconciliationVault;
function panel(overrides: Partial<React.ComponentProps<typeof ReconciliationLedger>> = {}) {
  return <ReconciliationLedger chainId={84532} sellerKeyId={keyId} matches={[match()]} scanMatchesCurrentScope {...overrides} />;
}
async function open(overrides: Partial<React.ComponentProps<typeof ReconciliationLedger>> = {}) {
  const user = userEvent.setup();
  render(panel(overrides));
  await user.click(screen.getByRole('button', { name: 'Unlock encrypted reconciliation vault' }));
  await screen.findByRole('button', { name: 'Lock reconciliation vault' });
  return user;
}
beforeEach(async () => {
  clearSession();
  const session = generateSession();
  keyId = checkpointKeyId(session.spendingPublicKey, session.viewingPublicKey);
  const data = new Map<string, string>();
  const store: ReconciliationVaultStore = {
    read: (key) => Promise.resolve(data.get(key) ?? null),
    compareAndSwap: (key, expected, next, guard) => {
      guard();
      if ((data.get(key) ?? null) !== expected) return Promise.resolve(false);
      data.set(key, next);
      return Promise.resolve(true);
    },
  };
  vault = new ReconciliationVault(store, { chainId: 84532, sellerKeyId: keyId }, () => undefined);
  await vault.unlock(new Uint8Array(32).fill(7));
  factory.create.mockResolvedValue(vault);
});
afterEach(() => {
  cleanup();
  clearSession();
  vi.restoreAllMocks();
});

describe('local invoice matching UI', () => {
  it('proposes an exact match for a current scan result and confirms it into the vault', async () => {
    await vault.registerInvoice(invoice(1));
    const onAnnounce = vi.fn();
    const user = await open({ onAnnounce });
    expect(await screen.findByText(/Exact local match proposed/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Confirm proposed invoice match' }));
    await waitFor(async () => expect((await vault.read())[0]?.invoiceDigest).toBe(invoice(1).invoiceDigest));
    expect(onAnnounce).toHaveBeenCalledWith('Invoice match confirmed in the encrypted reconciliation vault.');
    expect(await screen.findByText(/Linked to a verified observation/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Confirm proposed invoice match' })).toBeNull();
  });

  it('shows ambiguous candidates without a confirm action', async () => {
    await vault.registerInvoice(invoice(1));
    await vault.registerInvoice(invoice(2));
    await open();
    expect(await screen.findByText(/Several registered invoices have this chain/)).toBeTruthy();
    expect(screen.getByText(/never confirmed automatically/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Confirm proposed invoice match' })).toBeNull();
  });

  it('flags two current payments for one invoice as ambiguous', async () => {
    await vault.registerInvoice(invoice(1));
    await open({ matches: [match(1), match(2)] });
    expect((await screen.findAllByText(/Several unlinked payments match/)).length).toBe(2);
  });

  it('reports no match and ignores matches from stale scans', async () => {
    await vault.registerInvoice(invoice(1, '7'));
    await open();
    expect(await screen.findByText('No registered invoice matches this payment.')).toBeTruthy();
  });

  it('skips matches without a transaction hash', async () => {
    await vault.registerInvoice(invoice(1));
    const hashless = { ...match(4), announcement: { ...match(4).announcement, transactionHash: undefined } } as unknown as ScanMatch;
    await open({ matches: [hashless] });
    expect(screen.queryByText(/Exact local match proposed/)).toBeNull();
    expect(screen.queryByText('No registered invoice matches this payment.')).toBeNull();
  });

  it('never proposes matches from a stale scan', async () => {
    await vault.registerInvoice(invoice(1));
    await open({ scanMatchesCurrentScope: false });
    expect(screen.queryByText(/Exact local match proposed/)).toBeNull();
  });

  it('proposes and confirms stored observations, and refuses stale scan evidence', async () => {
    await vault.save(recordFromVerifiedMatch(match(3), keyId));
    await vault.registerInvoice(invoice(1));
    const user = await open({ matches: [] });
    await user.click(await screen.findByRole('button', { name: 'Confirm proposed invoice match' }));
    await waitFor(async () => expect((await vault.read())[0]?.invoiceDigest).toBe(invoice(1).invoiceDigest));
  });

  it('surfaces a refused confirmation when the vault no longer sees an exact pair', async () => {
    await vault.registerInvoice(invoice(1));
    const user = await open();
    await screen.findByText(/Exact local match proposed/);
    vi.spyOn(vault, 'confirmProposal').mockRejectedValueOnce(new Error('This payment no longer has a single exact invoice match.'));
    await user.click(screen.getByRole('button', { name: 'Confirm proposed invoice match' }));
    expect(await screen.findByText(/no longer has a single exact/)).toBeTruthy();
  });

  it('lists, removes and clears invoice registrations', async () => {
    await vault.registerInvoice(invoice(1, '9'));
    await vault.registerInvoice(invoice(2, '8'));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = await open({ matches: [] });
    expect(await screen.findByText(invoice(1).invoiceDigest)).toBeTruthy();
    await user.click(screen.getAllByRole('button', { name: 'Remove registration' })[0]!);
    await user.click(screen.getByRole('button', { name: 'Remove all invoice registrations' }));
    expect((await vault.readState()).invoices).toHaveLength(2);
    confirm.mockReturnValue(true);
    await user.click(screen.getAllByRole('button', { name: 'Remove registration' })[0]!);
    await waitFor(() => expect(screen.queryByText(invoice(1).invoiceDigest)).toBeNull());
    await user.click(screen.getByRole('button', { name: 'Remove all invoice registrations' }));
    expect(await screen.findByText('No invoices registered.')).toBeTruthy();
  });
});

describe('receipt archive UI', () => {
  const signingKey = new Uint8Array(32).fill(9);
  const receipt = (n: number) =>
    signReceipt({ invoiceDigest: invoice(n).invoiceDigest, chainId: 84532, txHash: `0x${(n + 0x100).toString(16).padStart(64, '0')}`, stealthAddress: ADDRESS, asset: 'native', amountMinorUnits: '2500000', issuedAt: nowSeconds }, signingKey);

  it('lists, exports with consent and deletes archived receipts', async () => {
    await vault.archiveReceipt(receipt(1), Date.now());
    await vault.archiveReceipt(receipt(2), Date.now());
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:receipts');
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = await open({ matches: [] });
    expect(await screen.findByText(receipt(1).txHash)).toBeTruthy();
    expect(screen.getByText(/never counts as payment evidence/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Export archived receipts' }));
    await user.click(screen.getAllByRole('button', { name: 'Delete archived receipt' })[0]!);
    await user.click(screen.getByRole('button', { name: 'Delete all archived receipts' }));
    expect(click).not.toHaveBeenCalled();
    expect((await vault.readState()).receipts).toHaveLength(2);
    confirm.mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: 'Export archived receipts' }));
    await waitFor(() => expect(click).toHaveBeenCalledOnce());
    await user.click(screen.getAllByRole('button', { name: 'Delete archived receipt' })[0]!);
    await waitFor(() => expect(screen.queryByText(receipt(1).txHash)).toBeNull());
    await user.click(screen.getByRole('button', { name: 'Delete all archived receipts' }));
    expect(await screen.findByText('No receipts archived.')).toBeTruthy();
  });

  it('previews registration and receipt counts in encrypted backups', async () => {
    await vault.registerInvoice(invoice(1, '9'));
    await vault.archiveReceipt(receipt(1), Date.now());
    const backup = await vault.exportEncrypted();
    await vault.clearInvoices();
    await vault.clearReceipts();
    const user = await open({ matches: [] });
    fireEvent.change(screen.getByLabelText('Encrypted reconciliation backup'), { target: { value: backup } });
    await user.click(screen.getByRole('button', { name: 'Preview encrypted backup' }));
    expect(await screen.findByText(/1 registered invoice;/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Activate previewed historical records' }));
    expect(await screen.findByRole('button', { name: 'Remove registration' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete archived receipt' })).toBeTruthy();
  });
});
