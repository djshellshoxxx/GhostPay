// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { AppLean } from '../AppLean';
import * as downloads from '../components/Common';
import { notifyAppLock } from '../lib/appLock';
import { RECONCILIATION_VAULT_CHANGE_EVENT } from '../lib/reconciliationVault';
import { clearSession, generateSession } from '../lib/session';
import { renderWith } from '../test/render';

const openVault = vi.hoisted(() => vi.fn());
vi.mock('../lib/reconciliationVault', async (importOriginal) => ({
  ...await importOriginal<typeof import('../lib/reconciliationVault')>(),
  createCurrentReconciliationVault: openVault,
}));

afterEach(() => { clearSession(); openVault.mockReset(); vi.restoreAllMocks(); vi.useRealTimers(); });

it('opens the real Pages route and handles loading, empty, stale, error, retry and lock', async () => {
  generateSession();
  const empty = { records: [], invoices: [], receipts: [], readOnly: false };
  let finishRead: (() => void) | undefined;
  const readState = vi.fn(() => new Promise((resolve) => { finishRead = () => { resolve(empty); }; }));
  openVault.mockResolvedValue({ readState, lock: vi.fn() });
  const user = userEvent.setup();
  renderWith(<AppLean />);
  const nav = screen.getByRole('navigation', { name: 'Main' });
  const route = within(nav).getByRole('button', { name: 'Merchant dashboard' });
  await user.click(route);
  expect(route.getAttribute('aria-current')).toBe('page');
  expect(document.activeElement?.id).toBe('main');
  await user.click(await screen.findByRole('button', { name: 'Open encrypted dashboard' }));
  expect(screen.getByText('Loading merchant dashboard…')).toBeTruthy();
  await act(async () => { finishRead?.(); });
  expect(await screen.findByText('No records match this view.')).toBeTruthy();
  expect(document.activeElement?.textContent).toBe('Network overview');
  openVault.mockRejectedValueOnce(new Error('private-internal-detail'));
  act(() => { window.dispatchEvent(new Event(RECONCILIATION_VAULT_CHANGE_EVENT)); });
  expect(screen.getByText('Merchant records are being refreshed…')).toBeTruthy();
  expect((await screen.findByRole('alert')).textContent).toContain('GhostPay could not read the encrypted merchant dashboard.');
  expect(screen.queryByText('private-internal-detail')).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Try again' }));
  await act(async () => { notifyAppLock('idle'); finishRead?.(); });
  expect(screen.getByText('The encrypted dashboard is locked.')).toBeTruthy();
  expect(screen.queryByText('No records match this view.')).toBeNull();
});

it('revokes an export when encrypted storage changes without delivering an invalidation event', async () => {
  generateSession();
  const downloaded = vi.spyOn(downloads, 'downloadText').mockImplementation(() => undefined);
  const initial = {
    records: [], receipts: [], readOnly: false,
    invoices: [{ invoiceDigest: '0x' + 'a'.repeat(64), chainId: 84532, asset: 'native', expectedNetMinorUnits: '100', expiresAt: 4_000_000_000 }],
  };
  const readState = vi.fn().mockResolvedValue(initial);
  openVault.mockResolvedValue({ readState, lock: vi.fn() });
  renderWith(<AppLean />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Merchant dashboard' }));
  const network = await screen.findByLabelText('Network');
  await user.selectOptions(network, '84532');
  await user.click(screen.getByRole('button', { name: 'Open encrypted dashboard' }));
  await user.click(await screen.findByRole('button', { name: 'Preview export' }));
  const agree = screen.getByRole('button', { name: 'Agree and download' });
  readState.mockResolvedValue({ ...initial, invoices: [] });
  fireEvent.click(agree);
  await waitFor(() => { expect(readState).toHaveBeenCalledTimes(3); });
  expect(downloaded).not.toHaveBeenCalled();
  expect(await screen.findByText('No records match this view.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Agree and download' })).toBeNull();
});

it('requires a fresh preview if an expiry changes the selected status before approval', async () => {
  generateSession();
  const start = Date.now();
  const now = vi.spyOn(Date, 'now').mockReturnValue(start);
  const downloaded = vi.spyOn(downloads, 'downloadText').mockImplementation(() => undefined);
  const readState = vi.fn().mockResolvedValue({
    records: [], receipts: [], readOnly: false,
    invoices: [{ invoiceDigest: '0x' + 'b'.repeat(64), chainId: 84532, asset: 'native', expectedNetMinorUnits: '100', expiresAt: Math.floor(start / 1000) + 10 }],
  });
  openVault.mockResolvedValue({ readState, lock: vi.fn() });
  renderWith(<AppLean />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Merchant dashboard' }));
  await user.selectOptions(await screen.findByLabelText('Network'), '84532');
  await user.click(screen.getByRole('button', { name: 'Open encrypted dashboard' }));
  await user.selectOptions(await screen.findByLabelText('Status'), 'open');
  await user.click(screen.getByRole('button', { name: 'Preview export' }));
  now.mockReturnValue(start + 11_000);
  fireEvent.click(screen.getByRole('button', { name: 'Agree and download' }));
  expect(downloaded).not.toHaveBeenCalled();
  expect(readState).toHaveBeenCalledTimes(1);
  expect(screen.getByText('No records match this view.')).toBeTruthy();
});
