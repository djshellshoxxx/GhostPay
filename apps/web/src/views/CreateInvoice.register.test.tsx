// @vitest-environment jsdom
import { parseFragment } from '@ghostpay/invoice-schema';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession } from '../lib/session';
import { generateWaivedSession } from '../test/keys';
import { checkpointKeyId } from '../lib/scanClient';
import { registrationFromInvoice } from '../lib/reconciliationMatch';
import { makeServices, renderApp } from '../test/render';

const factory = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('../lib/reconciliationVault', async (original) => ({
  ...(await original<typeof import('../lib/reconciliationVault')>()),
  createCurrentReconciliationVault: factory.create,
}));

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});
afterEach(() => {
  factory.create.mockReset();
});

async function create(register: boolean, amount = '2') {
  const user = userEvent.setup();
  renderApp(makeServices());
  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Create invoice' }));
  if (amount !== '') await user.type(screen.getByLabelText('Token amount'), amount);
  await user.type(screen.getByLabelText('Item 1 description'), 'Design work');
  await user.type(screen.getByLabelText('Item 1 unit price'), '1.00');
  if (register) await user.click(screen.getByLabelText(/Register this invoice in my encrypted reconciliation vault/));
  await user.click(screen.getByRole('button', { name: 'Create invoice link' }));
  return user;
}

describe('Create invoice: opt-in registration for local matching', () => {
  it('does not touch the reconciliation vault unless the seller opts in', async () => {
    generateWaivedSession();
    await create(false);
    await screen.findByLabelText('Link');
    expect(factory.create).not.toHaveBeenCalled();
    expect(screen.queryByText(/registered in your encrypted reconciliation vault/)).toBeNull();
  });

  it('registers minimized invoice fields in the current seller scope and locks the vault', async () => {
    const session = generateWaivedSession();
    const vault = { registerInvoice: vi.fn().mockResolvedValue(undefined), lock: vi.fn() };
    factory.create.mockResolvedValue(vault);
    await create(true);
    expect(await screen.findByText('Invoice registered in your encrypted reconciliation vault for local matching.')).toBeTruthy();
    const link = screen.getByLabelText<HTMLTextAreaElement>('Link').value;
    const { invoice } = await parseFragment(link.slice('https://app.test/'.length));
    expect(factory.create).toHaveBeenCalledWith(invoice.chainId, checkpointKeyId(session.spendingPublicKey, session.viewingPublicKey));
    const entry = vault.registerInvoice.mock.calls[0]![0] as ReturnType<typeof registrationFromInvoice>;
    expect({ ...entry, registeredAt: 1 }).toEqual(registrationFromInvoice(invoice, 1));
    expect(vault.lock).toHaveBeenCalledOnce();
  });

  it('keeps the created link and warns when registration fails', async () => {
    generateWaivedSession();
    const vault = { registerInvoice: vi.fn().mockRejectedValue(new Error('vault is read-only')), lock: vi.fn() };
    factory.create.mockResolvedValue(vault);
    const user = await create(true);
    expect(await screen.findByText(/could not be registered for local matching/)).toBeTruthy();
    expect(screen.getByLabelText('Link')).toBeTruthy();
    expect(vault.lock).toHaveBeenCalledOnce();
    // A later validation error clears the stale registration status together with the link.
    await user.clear(screen.getByLabelText('Token amount'));
    await user.click(screen.getByRole('button', { name: 'Create invoice link' }));
    await screen.findByRole('alert');
    expect(screen.queryByText(/could not be registered/)).toBeNull();
  });

  it('shows progress while the vault is opening', async () => {
    generateWaivedSession();
    factory.create.mockReturnValue(new Promise(() => undefined));
    await create(true);
    expect(await screen.findByText(/Registering the invoice/)).toBeTruthy();
  });
});
