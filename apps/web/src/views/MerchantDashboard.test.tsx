// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import fc from 'fast-check';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { AppShell, CORE_ORDER } from '../AppShell';
import * as downloads from '../components/Common';
import { notifyAppLock } from '../lib/appLock';
import { RECONCILIATION_VAULT_CHANGE_EVENT } from '../lib/reconciliationVault';
import { checkpointKeyId } from '../lib/scanClient';
import { clearSession, generateSession, getSessionPublic } from '../lib/session';
import { renderWith } from '../test/render';
import MerchantDashboard from './MerchantDashboard';

// The dashboard is never part of the lean Pages app; it renders only as an opt-in full-profile view (see App.tsx).
const ORDER = [...CORE_ORDER.slice(0, CORE_ORDER.indexOf('scan') + 1), 'dashboard' as const, ...CORE_ORDER.slice(CORE_ORDER.indexOf('scan') + 1)];
function DashboardApp(): ReactNode {
  return <AppShell profile="full" order={ORDER} extraViews={{ dashboard: <MerchantDashboard /> }} />;
}

const openVault = vi.hoisted(() => vi.fn());
vi.mock('../lib/reconciliationVault', async (importOriginal) => ({
  ...await importOriginal<typeof import('../lib/reconciliationVault')>(),
  createCurrentReconciliationVault: openVault,
}));

// Resolve the callback inside async act so storage continuations and layout effects finish together.
function settle(action: () => void): Promise<void> {
  return act(() => Promise.resolve(action()));
}

afterEach(() => { clearSession(); openVault.mockReset(); vi.restoreAllMocks(); vi.useRealTimers(); });

it('opens the real Pages route and handles loading, empty, stale, error, retry and lock', async () => {
  generateSession();
  const empty = { records: [], invoices: [], receipts: [], readOnly: false };
  let finishRead: (() => void) | undefined;
  const readState = vi.fn(() => new Promise((resolve) => { finishRead = () => { resolve(empty); }; }));
  openVault.mockResolvedValue({ readState, lock: vi.fn() });
  const user = userEvent.setup();
  renderWith(<DashboardApp />);
  const nav = screen.getByRole('navigation', { name: 'Main' });
  const route = within(nav).getByRole('button', { name: 'Merchant dashboard' });
  await user.click(route);
  expect(route.getAttribute('aria-current')).toBe('page');
  expect(document.activeElement?.id).toBe('main');
  await user.click(await screen.findByRole('button', { name: 'Open encrypted dashboard' }));
  expect(screen.getByText('Loading merchant dashboard…')).toBeTruthy();
  await settle(() => { finishRead?.(); });
  expect(await screen.findByText('No invoices are registered in this vault for this network.')).toBeTruthy();
  expect(document.activeElement?.textContent).toBe('Network overview');
  openVault.mockRejectedValueOnce(new Error('private-internal-detail'));
  act(() => { window.dispatchEvent(new Event(RECONCILIATION_VAULT_CHANGE_EVENT)); });
  expect(screen.getByText('Merchant records are being refreshed…')).toBeTruthy();
  expect((await screen.findByRole('alert')).textContent).toContain('GhostPay could not read the encrypted merchant dashboard.');
  expect(screen.queryByText('private-internal-detail')).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Try again' }));
  await settle(() => { notifyAppLock('idle'); finishRead?.(); });
  expect(screen.getByText('The encrypted dashboard is locked.')).toBeTruthy();
  expect(screen.queryByText('No invoices are registered in this vault for this network.')).toBeNull();
});

it('revokes an export when encrypted storage changes without delivering an invalidation event', async () => {
  generateSession();
  const downloaded = vi.spyOn(downloads, 'downloadText').mockImplementation(() => undefined);
  const initial = {
    records: [], receipts: [], readOnly: false,
    invoices: [{ invoiceDigest: '0x' + 'a'.repeat(64), chainId: 84532, asset: 'native', expectedNetMinorUnits: '100', expiresAt: 4_000_000_000 }],
  };
  const readState = vi.fn<() => Promise<typeof initial>>().mockResolvedValue(initial);
  openVault.mockResolvedValue({ readState, lock: vi.fn() });
  renderWith(<DashboardApp />);
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
  expect(await screen.findByText('No invoices are registered in this vault for this network.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Agree and download' })).toBeNull();
});

it('clears record filters, returns to page one and revokes the filtered export preview', async () => {
  generateSession();
  const invoices = Array.from({ length: 27 }, (_, index) => ({
    invoiceDigest: '0x' + index.toString(16).padStart(64, '0'),
    chainId: 84532, asset: 'native', expectedNetMinorUnits: '100', expiresAt: 2_524_608_000 + index,
  }));
  openVault.mockResolvedValue({ lock: vi.fn(), readState: () => Promise.resolve({ invoices, records: [], receipts: [], readOnly: false }) });
  const user = userEvent.setup();
  renderWith(<DashboardApp />);
  await user.click(screen.getByRole('button', { name: 'Merchant dashboard' }));
  const network = await screen.findByLabelText('Network');
  await user.selectOptions(network, '84532');
  await user.click(screen.getByRole('button', { name: 'Open encrypted dashboard' }));
  const filters = within(await screen.findByRole('group', { name: 'Browse records' }));
  const search = filters.getByRole('searchbox');
  await user.selectOptions(filters.getByLabelText('Sort by date'), 'oldest');
  await user.selectOptions(screen.getByLabelText('File format'), 'json');
  // All references share this prefix. The filtered list still spans two pages.
  await user.type(search, '0x0');
  await user.selectOptions(filters.getByLabelText('Status'), 'open');
  fireEvent.change(filters.getByLabelText('From date (UTC)'), { target: { value: '2049-01-01' } });
  fireEvent.change(filters.getByLabelText('Through date (UTC)'), { target: { value: '2051-01-01' } });
  await user.click(screen.getByRole('button', { name: 'Next page' }));
  expect(screen.getByText('Showing 26–27 of 27')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Preview export' }));
  expect(screen.getByRole('button', { name: 'Agree and download' })).toBeTruthy();

  filters.getByRole('button', { name: 'Clear filters' }).focus();
  await user.keyboard('{Enter}');
  expect(document.activeElement).toBe(search);
  for (const field of [search, filters.getByLabelText('Status'), filters.getByLabelText('From date (UTC)'), filters.getByLabelText('Through date (UTC)')]) {
    expect((field as HTMLInputElement | HTMLSelectElement).value).toBe('');
  }
  expect(screen.getByText('Showing 1–25 of 27')).toBeTruthy();
  expect((network as HTMLSelectElement).value).toBe('84532');
  expect(filters.getByLabelText<HTMLSelectElement>('Sort by date').value).toBe('oldest');
  expect(screen.getByLabelText<HTMLSelectElement>('File format').value).toBe('json');
  expect(screen.queryByRole('button', { name: 'Agree and download' })).toBeNull();
  // Only the initial read: no release recheck happened for the revoked preview.
  expect(openVault).toHaveBeenCalledTimes(1);

  await user.selectOptions(filters.getByLabelText('Record type'), 'payments');
  expect(screen.getByText('No payment observations are saved in this vault for this network.')).toBeTruthy();
  await user.type(search, 'unmatched');
  await user.click(filters.getByRole('button', { name: 'Clear filters' }));
  expect(filters.getByLabelText<HTMLSelectElement>('Record type').value).toBe('payments');
  expect(screen.getByText('No payment observations are saved in this vault for this network.')).toBeTruthy();
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
  renderWith(<DashboardApp />);
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
  expect(screen.getByRole('alert').textContent).toBe(
    'The export selection changed before download, so no file was saved. Preview the export again.');
});

it.each(['opening', 'ready', 'refreshing', 'error'] as const)(
  'preserves the keyboard destination across overlapping updates while %s',
  async (phase) => {
    generateSession();
    const empty = { records: [], invoices: [], receipts: [], readOnly: false };
    const update = fc.record({
      focus: fc.constantFrom('stay', 'network', 'navigation'),
      afterSignal: fc.boolean(),
      finishPrevious: fc.boolean(),
      previousFails: fc.boolean(),
    });

    await fc.assert(fc.asyncProperty(fc.array(update, { minLength: 1, maxLength: 4 }), fc.boolean(), async (updates, finalFails) => {
      const reads: ((fail: boolean) => void)[] = [];
      openVault.mockResolvedValue({
        lock: vi.fn(),
        readState: () => new Promise((resolve, reject) => {
          reads.push((fail) => { if (fail) reject(new Error('fixture read failure')); else resolve(empty); });
        }),
      });

      renderWith(<DashboardApp />);
      try {
        const nav = screen.getByRole('button', { name: 'Merchant dashboard' });
        fireEvent.click(nav);
        const network = await screen.findByLabelText('Network');
        await settle(() => { fireEvent.click(screen.getByRole('button', { name: 'Open encrypted dashboard' })); });
        if (phase !== 'opening') {
          await settle(() => { reads[0]!(phase === 'error'); });
          if (phase === 'refreshing') {
            await settle(() => { fireEvent.click(screen.getByRole('button', { name: 'Refresh local records' })); });
          }
        }

        let persistent: HTMLElement | undefined;
        const late: (() => void)[] = [];
        for (const step of updates) {
          const moveFocus = (): void => {
            if (step.focus === 'stay') return;
            persistent = step.focus === 'network' ? network : nav;
            persistent.focus();
          };
          const previous = reads[reads.length - 1]!;
          const count = reads.length;
          await settle(() => {
            if (!step.afterSignal) moveFocus();
            window.dispatchEvent(new Event(RECONCILIATION_VAULT_CHANGE_EVENT));
            if (step.afterSignal) moveFocus();
          });
          expect(reads).toHaveLength(count + 1);
          const finishPrevious = (): void => { previous(step.previousFails); };
          if (step.finishPrevious) await settle(finishPrevious);
          else late.push(finishPrevious);
          expect(document.activeElement === (persistent ?? screen.getByText('Merchant records are being refreshed…'))).toBe(true);
        }

        await settle(() => { reads[reads.length - 1]!(finalFails); });
        await settle(() => { for (const finish of late.reverse()) finish(); });
        const destination = finalFails
          ? screen.getByRole('button', { name: 'Try again' })
          : screen.getByRole('heading', { name: 'Network overview' });
        expect(document.activeElement === (persistent ?? destination)).toBe(true);
      } finally {
        cleanup();
      }
    }), {
      seed: 543, numRuns: 32,
      examples: [
        [[{ focus: 'stay', afterSignal: false, finishPrevious: false, previousFails: true }], false],
        [[{ focus: 'network', afterSignal: false, finishPrevious: true, previousFails: false }], true],
        [[{ focus: 'navigation', afterSignal: true, finishPrevious: true, previousFails: true }], false],
      ],
    });
  },
);

function scopedRecord(overrides: Record<string, unknown>) {
  const session = getSessionPublic();
  if (session === undefined) throw new Error('session required');
  return {
    version: 1, id: 'r', chainId: 84532, sellerKeyId: checkpointKeyId(session.spendingPublicKey, session.viewingPublicKey),
    transactionHash: '0x' + '1'.repeat(64), stealthAddress: '0x' + '2'.repeat(40), blockHash: '0x' + '3'.repeat(64),
    asset: 'native', blockNumber: '9', blockTimestamp: '2524608000', logIndex: 0, amountMinorUnits: '5',
    recordedAt: 2_524_608_000_000, evidenceSource: 'verified-router-scan', evidenceStatus: 'verified-at-scan',
    viewTagMatched: true, provenance: 'live-scan', ...overrides,
  };
}

it('filters by asset, reports exact verified-at-scan totals and exports consented payment history', async () => {
  generateSession();
  const usdc = '0x' + 'c'.repeat(40);
  const huge = (2n ** 256n - 1n).toString();
  const downloaded = vi.spyOn(downloads, 'downloadText').mockImplementation(() => undefined);
  const ledger = {
    receipts: [], readOnly: false,
    invoices: [
      { invoiceDigest: '0x' + 'a'.repeat(64), chainId: 84532, asset: 'native', expectedNetMinorUnits: huge, expiresAt: 4_000_000_000 },
      { invoiceDigest: '0x' + 'b'.repeat(64), chainId: 84532, asset: usdc, expectedNetMinorUnits: '7', expiresAt: 4_000_000_000 },
    ],
    records: [
      scopedRecord({ id: 'p1', amountMinorUnits: huge, invoiceDigest: '0x' + 'a'.repeat(64) }),
      scopedRecord({ id: 'p1', amountMinorUnits: huge, invoiceDigest: '0x' + 'a'.repeat(64) }),
      scopedRecord({ id: 'p2', logIndex: 1, amountMinorUnits: '3' }),
      scopedRecord({ id: 'p3', logIndex: 2, amountMinorUnits: '1000', provenance: 'imported-history' }),
      scopedRecord({ id: 'p4', logIndex: 3, amountMinorUnits: '4', asset: usdc, transactionHash: '0x' + '4'.repeat(64) }),
    ],
  };
  const readState = vi.fn().mockResolvedValue(ledger);
  openVault.mockResolvedValue({ readState, lock: vi.fn() });
  renderWith(<DashboardApp />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Merchant dashboard' }));
  await user.selectOptions(await screen.findByLabelText('Network'), '84532');
  await user.click(screen.getByRole('button', { name: 'Open encrypted dashboard' }));
  const report = within(await screen.findByRole('region', { name: 'Report for this view' }));
  // The duplicate copy of p1 counts once; the imported observation never counts.
  expect(report.getByText(`Verified-at-scan payments: 2 · ${(2n ** 256n + 2n).toString()} atomic units`)).toBeTruthy();
  expect(report.getByText(`Of which locally associated with a registered invoice of this asset: ${huge} atomic units`)).toBeTruthy();
  expect(report.getByText('Excluded from payment totals: 1 imported, reorganized or review-required observations.')).toBeTruthy();

  const filters = within(screen.getByRole('group', { name: 'Browse records' }));
  await user.selectOptions(filters.getByLabelText('Asset'), 'erc20:' + usdc);
  expect(report.getByText('Invoices: 1 · expected 7 atomic units')).toBeTruthy();
  expect(report.getByText('Verified-at-scan payments: 1 · 4 atomic units')).toBeTruthy();
  expect(report.queryByText(new RegExp(huge, 'u'))).toBeNull();

  await user.selectOptions(filters.getByLabelText('Record type'), 'payments');
  expect(screen.getByText('Showing 1–1 of 1')).toBeTruthy();
  expect(filters.getByLabelText<HTMLSelectElement>('Asset').value).toBe('erc20:' + usdc);
  await user.click(screen.getByRole('button', { name: 'Preview payment export' }));
  expect(screen.getByText('Export 1 payment observations (1 verified at scan time) as CSV?')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Agree and download' }));
  await waitFor(() => { expect(downloaded).toHaveBeenCalledOnce(); });
  const [name, content, mime] = downloaded.mock.calls[0]!;
  expect(name).toBe('ghostpay-payments.csv');
  expect(mime).toBe('text/csv;charset=utf-8');
  expect(content).toContain(`eip155:84532,erc20:${usdc},historical,2050-01-01T00:00:00.000Z,9,4,0x${'4'.repeat(64)},3,`);
  expect(content).not.toContain('0x' + '2'.repeat(40));
  expect(content).not.toContain(huge);
  expect(document.activeElement?.textContent).toBe('Preview payment export');
  // Two reads: the dashboard load and the authenticated release recheck.
  expect(readState).toHaveBeenCalledTimes(2);
});

it('withholds the payment history file when the encrypted ledger changed after preview', async () => {
  generateSession();
  const downloaded = vi.spyOn(downloads, 'downloadText').mockImplementation(() => undefined);
  const ledger = { receipts: [], readOnly: false, invoices: [], records: [scopedRecord({})] };
  const readState = vi.fn().mockResolvedValue(ledger);
  openVault.mockResolvedValue({ readState, lock: vi.fn() });
  renderWith(<DashboardApp />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Merchant dashboard' }));
  await user.selectOptions(await screen.findByLabelText('Network'), '84532');
  await user.click(screen.getByRole('button', { name: 'Open encrypted dashboard' }));
  await user.selectOptions(within(await screen.findByRole('group', { name: 'Browse records' })).getByLabelText('Record type'), 'payments');
  await user.click(screen.getByRole('button', { name: 'Preview payment export' }));
  readState.mockResolvedValue({ ...ledger, records: [] });
  await user.click(screen.getByRole('button', { name: 'Agree and download' }));
  expect(await screen.findByText('No payment observations are saved in this vault for this network.')).toBeTruthy();
  expect(downloaded).not.toHaveBeenCalled();
  expect(readState).toHaveBeenCalledTimes(3);
});

it('keeps a merchant typing in Search when another tab changes the ledger', async () => {
  generateSession();
  const invoices = [{ invoiceDigest: '0x' + 'a'.repeat(64), chainId: 84532, asset: 'native', expectedNetMinorUnits: '1', expiresAt: 4_000_000_000 }];
  openVault.mockResolvedValue({ lock: vi.fn(), readState: () => Promise.resolve({ invoices, records: [], receipts: [], readOnly: false }) });
  const user = userEvent.setup();
  renderWith(<DashboardApp />);
  await user.click(screen.getByRole('button', { name: 'Merchant dashboard' }));
  await user.selectOptions(await screen.findByLabelText('Network'), '84532');
  await user.click(screen.getByRole('button', { name: 'Open encrypted dashboard' }));
  await user.type(await screen.findByRole('searchbox'), '0xa');
  await settle(() => { window.dispatchEvent(new Event(RECONCILIATION_VAULT_CHANGE_EVENT)); });
  const search = await screen.findByRole<HTMLInputElement>('searchbox');
  await waitFor(() => { expect(document.activeElement).toBe(search); });
  expect(search.value).toBe('0xa');
  expect(search.selectionStart).toBe(3);
  await user.type(search, 'a');
  expect(search.value).toBe('0xaa');
});

it('moves focus to the announced range when a pager button disables itself', async () => {
  generateSession();
  const invoices = Array.from({ length: 27 }, (_, index) => ({
    invoiceDigest: '0x' + index.toString(16).padStart(64, '0'),
    chainId: 84532, asset: 'native', expectedNetMinorUnits: '1', expiresAt: 4_000_000_000 + index,
  }));
  openVault.mockResolvedValue({ lock: vi.fn(), readState: () => Promise.resolve({ invoices, records: [], receipts: [], readOnly: false }) });
  const user = userEvent.setup();
  renderWith(<DashboardApp />);
  await user.click(screen.getByRole('button', { name: 'Merchant dashboard' }));
  await user.selectOptions(await screen.findByLabelText('Network'), '84532');
  await user.click(screen.getByRole('button', { name: 'Open encrypted dashboard' }));
  const next = await screen.findByRole('button', { name: 'Next page' });
  next.focus();
  await user.keyboard('{Enter}');
  expect((next as HTMLButtonElement).disabled).toBe(true);
  expect(document.activeElement?.textContent).toBe('Showing 26–27 of 27');
  const previous = screen.getByRole('button', { name: 'Previous page' });
  previous.focus();
  await user.keyboard('{Enter}');
  expect(document.activeElement?.textContent).toBe('Showing 1–25 of 27');
});

it('tells the merchant when a reviewed export was withdrawn and finds payments regardless of hex case', async () => {
  generateSession();
  const downloaded = vi.spyOn(downloads, 'downloadText').mockImplementation(() => undefined);
  const ledger = { receipts: [], readOnly: false, invoices: [], records: [scopedRecord({ transactionHash: '0x' + 'ab'.repeat(32) })] };
  const readState = vi.fn().mockResolvedValue(ledger);
  openVault.mockResolvedValue({ readState, lock: vi.fn() });
  const user = userEvent.setup();
  renderWith(<DashboardApp />);
  await user.click(screen.getByRole('button', { name: 'Merchant dashboard' }));
  await user.selectOptions(await screen.findByLabelText('Network'), '84532');
  await user.click(screen.getByRole('button', { name: 'Open encrypted dashboard' }));
  const filters = within(await screen.findByRole('group', { name: 'Browse records' }));
  await user.selectOptions(filters.getByLabelText('Record type'), 'payments');
  await user.type(filters.getByRole('searchbox'), 'ABAB');
  expect(screen.getByText('Showing 1–1 of 1')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Preview payment export' }));
  readState.mockResolvedValue({ ...ledger, records: [] });
  await user.click(screen.getByRole('button', { name: 'Agree and download' }));
  expect((await screen.findByRole('alert')).textContent).toBe(
    'The export selection changed before download, so no file was saved. Preview the export again.');
  expect(downloaded).not.toHaveBeenCalled();
});
