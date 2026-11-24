// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, generateSession } from '../lib/session';
import { checkpointKeyId } from '../lib/scanClient';
import { ReconciliationVault, type ReconciliationVaultStore } from '../lib/reconciliationVault';
import type { RegisteredInvoice } from '../lib/reconciliationMatch';
import { ReconciliationLedger } from './ReconciliationLedger';
import { PrivacyProvider, usePrivacy } from '../lib/privacyMode';

const factory = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('../lib/reconciliationVault', async (original) => ({
  ...(await original<typeof import('../lib/reconciliationVault')>()),
  createCurrentReconciliationVault: factory.create,
}));
const CONSENT = 'Allow registration-time cleanup for this unlocked vault';
const PREVIEW = 'Preview registration-time cleanup';
const CONFIRM = 'Remove registration timestamps';
let sellerKeyId: string;
let vault: ReconciliationVault;
let data: Map<string, string>;
let beforeWrite: (() => void | Promise<void>) | undefined;
let writes: number;
function invoice(n = 1): RegisteredInvoice {
  return { version: 1, invoiceDigest: `0x${n.toString(16).padStart(64, '0')}`, nonce: n.toString(16).padStart(32, '0'),
    chainId: 84532, asset: 'native', expectedNetMinorUnits: '100', createdAt: 1_000, expiresAt: 2_000, registeredAt: 1_500_000 + n };
}
function panel() { return <ReconciliationLedger chainId={84532} sellerKeyId={sellerKeyId} matches={[]} scanMatchesCurrentScope />; }
async function open() {
  const user = userEvent.setup();
  render(panel());
  await user.click(screen.getByRole('button', { name: 'Unlock encrypted reconciliation vault' }));
  await screen.findByRole('checkbox', { name: CONSENT });
  return user;
}
async function preview(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('checkbox', { name: CONSENT }));
  await user.click(screen.getByRole('button', { name: PREVIEW }));
  await screen.findByRole('group', { name: 'Confirm removal of local registration times' });
}
beforeEach(async () => {
  clearSession(); localStorage.clear(); beforeWrite = undefined; writes = 0;
  const session = generateSession(); sellerKeyId = checkpointKeyId(session.spendingPublicKey, session.viewingPublicKey);
  data = new Map();
  const store: ReconciliationVaultStore = {
    read: (key) => Promise.resolve(data.get(key) ?? null),
    compareAndSwap: async (key, expected, next, guard) => {
      await beforeWrite?.(); guard();
      if ((data.get(key) ?? null) !== expected) return false;
      writes++; data.set(key, next); return true;
    },
  };
  vault = new ReconciliationVault(store, { chainId: 84532, sellerKeyId }, () => undefined);
  await vault.unlock(new Uint8Array(32).fill(7));
  await vault.registerInvoice(invoice());
  factory.create.mockImplementation(async () => { await vault.unlock(new Uint8Array(32).fill(7)); return vault; });
});
afterEach(() => { cleanup(); clearSession(); localStorage.clear(); vi.restoreAllMocks(); });

describe('persistent invoice timestamp cleanup in the actual ledger', () => {
  it('clears cleanup consent and preview on quick hide without changing saved data', async () => {
    function Controls() {
      const privacy = usePrivacy();
      return <><button onClick={privacy.reveal}>Reveal test details</button><button onClick={privacy.hide}>Hide test details</button></>;
    }
    const user = userEvent.setup();
    render(<PrivacyProvider enabled scope={sellerKeyId}><Controls />{panel()}</PrivacyProvider>);
    await user.click(screen.getByRole('button', { name: 'Reveal test details' }));
    await user.click(screen.getByRole('button', { name: 'Unlock encrypted reconciliation vault' }));
    await user.click(await screen.findByRole('button', { name: 'Reveal history for 30 seconds' }));
    await preview(user); const before = [...data];
    await user.click(screen.getByRole('button', { name: 'Hide test details' }));
    await waitFor(() => expect(screen.queryByText('Registration timestamps to remove: 1.')).toBeNull());
    await user.click(screen.getByRole('button', { name: 'Reveal test details' }));
    await user.click(screen.getByRole('button', { name: 'Reveal history for 30 seconds' }));
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: CONSENT }).checked).toBe(false);
    expect([...data]).toEqual(before);
  });

  it('starts off and preserves ciphertext on preview/cancel before explicitly removing only local save times', async () => {
    const user = await open();
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: CONSENT }).checked).toBe(false);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: PREVIEW }).disabled).toBe(true);
    const before = [...data]; const priorWrites = writes;
    await preview(user);
    expect(screen.getByText('Registration timestamps to remove: 1.')).toBeTruthy();
    expect(screen.getByText(/older GhostPay versions cannot open/)).toBeTruthy();
    expect([...data]).toEqual(before); expect(writes).toBe(priorWrites);
    await user.click(screen.getByRole('button', { name: 'Cancel cleanup' }));
    expect(screen.queryByRole('button', { name: CONFIRM })).toBeNull(); expect([...data]).toEqual(before);
    await user.click(screen.getByRole('button', { name: PREVIEW }));
    await user.click(await screen.findByRole('button', { name: CONFIRM }));
    await screen.findByText('Local registration timestamps removed. Invoice registrations and payment history remain saved.');
    expect((await vault.readState()).invoices).toEqual([{ ...invoice(), version: 2, registeredAt: null }]);
    expect((await vault.readState()).records).toEqual([]);
    expect(writes).toBe(priorWrites + 1);
    await user.click(screen.getByRole('button', { name: PREVIEW }));
    await screen.findByText('Registration timestamps to remove: 0.');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: CONFIRM }).disabled).toBe(true);
  });

  it('revokes approval when consent is unchecked and starts off again after locking and unlocking', async () => {
    const user = await open(); await preview(user); const before = [...data];
    await user.click(screen.getByRole('checkbox', { name: CONSENT }));
    expect(screen.queryByRole('button', { name: CONFIRM })).toBeNull(); expect([...data]).toEqual(before);
    await preview(user);
    await user.click(screen.getByRole('button', { name: 'Lock reconciliation vault' }));
    expect(screen.queryByRole('checkbox', { name: CONSENT })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Unlock encrypted reconciliation vault' }));
    expect((await screen.findByRole<HTMLInputElement>('checkbox', { name: CONSENT })).checked).toBe(false);
    expect(screen.queryByRole('button', { name: CONFIRM })).toBeNull(); expect([...data]).toEqual(before);
  });

  it('rejects stale approval after another write without removing any newly registered timestamps', async () => {
    const user = await open(); await preview(user);
    await vault.registerInvoice(invoice(2)); const concurrent = [...data]; const priorWrites = writes;
    await user.click(screen.getByRole('button', { name: CONFIRM }));
    await screen.findByText(/changed in another tab/);
    expect([...data]).toEqual(concurrent); expect(writes).toBe(priorWrites);
    expect((await vault.readState()).invoices).toEqual([invoice(), invoice(2)]);
    expect(screen.queryByRole('button', { name: CONFIRM })).toBeNull();
  });

  it.each(['consent', 'cancel', 'lock', 'session'] as const)('revokes a pending write at the %s boundary', async (boundary) => {
    const user = await open(); await preview(user); const before = [...data]; const priorWrites = writes;
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let reached = false;
    beforeWrite = () => { reached = true; return held; };
    await user.click(screen.getByRole('button', { name: CONFIRM }));
    await waitFor(() => expect(reached).toBe(true));
    if (boundary === 'consent') await user.click(screen.getByRole('checkbox', { name: CONSENT }));
    else if (boundary === 'cancel') await user.click(screen.getByRole('button', { name: 'Cancel cleanup' }));
    else if (boundary === 'lock') await user.click(screen.getByRole('button', { name: 'Lock reconciliation vault' }));
    else { clearSession(); generateSession(); }
    release?.();
    await waitFor(() => {
      if (boundary === 'consent' || boundary === 'cancel') expect(screen.getByRole('alert').textContent).toMatch(/stale/i);
      else expect(screen.getByRole('button', { name: 'Unlock encrypted reconciliation vault' })).toBeTruthy();
    });
    expect([...data]).toEqual(before); expect(writes).toBe(priorWrites);
  });
});

it('keeps age preferences by category across remounts and guards against missed storage events', async () => {
  const user = await open();
  const categories = screen.getAllByRole<HTMLSelectElement>('combobox', { name: 'Include timestamps aged' });
  const [invoiceDays, receiptDays] = categories;
  await user.selectOptions(invoiceDays!, '30');
  await user.selectOptions(receiptDays!, '90');
  await preview(user);
  const prior = [...data];
  localStorage.setItem('ghostpay.retention.invoice-registration-timestamps.days.v1', '90');
  await user.click(screen.getByRole('button', { name: CONFIRM }));
  await screen.findByText(/became stale/i);
  expect([...data]).toEqual(prior);
  await user.click(screen.getByRole('button', { name: 'Lock reconciliation vault' }));
  await user.click(screen.getByRole('button', { name: 'Unlock encrypted reconciliation vault' }));
  const fields = await screen.findAllByRole<HTMLSelectElement>('combobox', { name: 'Include timestamps aged' });
  expect(fields.map((field) => field.value)).toEqual(['90', '90']);
  expect(screen.getByRole<HTMLInputElement>('checkbox', { name: CONSENT }).checked).toBe(false);
});

it('blocks review under a corrupted age preference until a valid choice is saved', async () => {
  localStorage.setItem('ghostpay.retention.invoice-registration-timestamps.days.v1', '-1');
  const user = await open();
  await user.click(screen.getByRole('checkbox', { name: CONSENT }));
  expect(screen.getByRole<HTMLButtonElement>('button', { name: PREVIEW }).disabled).toBe(true);
  await user.selectOptions(screen.getAllByRole('combobox', { name: 'Include timestamps aged' })[0]!, '30');
  await user.click(screen.getByRole('button', { name: PREVIEW }));
  await screen.findByText('Registration timestamps to remove: 1.');
});

it('requires a successful age selection after storage refuses a narrower policy', async () => {
  const user = await open();
  await user.click(screen.getByRole('checkbox', { name: CONSENT }));
  const field = screen.getAllByRole('combobox', { name: 'Include timestamps aged' })[0]!;
  const denied = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  await user.selectOptions(field, '90');
  expect(screen.getByRole<HTMLButtonElement>('button', { name: PREVIEW }).disabled).toBe(true);
  expect((field as HTMLSelectElement).value).toBe('');
  denied.mockRestore();
  await user.selectOptions(field, '30');
  await user.click(screen.getByRole('button', { name: PREVIEW }));
  await screen.findByText('Registration timestamps to remove: 1.');
});

it('offers cancellation only in the panel that owns the pending action', async () => {
  const user = await open();
  await user.click(screen.getByRole('checkbox', { name: 'Allow receipt archive-time cleanup for this unlocked vault' }));
  await preview(user);
  let release: (() => void) | undefined;
  const held = new Promise<void>((resolve) => { release = resolve; });
  beforeWrite = () => held;
  const before = [...data];
  await user.click(screen.getByRole('button', { name: CONFIRM }));
  await user.click(await screen.findByRole('button', { name: 'Cancel cleanup' }));
  release?.();
  await screen.findByText(/became stale/i);
  expect([...data]).toEqual(before);
});
