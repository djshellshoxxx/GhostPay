// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import fc from 'fast-check';
import { afterEach, expect, it, vi } from 'vitest';
import { AppLean } from '../AppLean';
import * as downloads from '../components/Common';
import { notifyAppLock } from '../lib/appLock';
import { RECONCILIATION_VAULT_CHANGE_EVENT } from '../lib/reconciliationVault';
import { clearSession, generateSession } from '../lib/session';
import { renderWith } from '../test/render';

const openVault = vi.hoisted(() => vi.fn());
const releaseState = vi.hoisted(() => vi.fn<typeof import('../lib/reconciliationVault').releaseFromCurrentReconciliationState>());
vi.mock('../lib/reconciliationVault', async (importOriginal) => ({
  ...await importOriginal<typeof import('../lib/reconciliationVault')>(),
  createCurrentReconciliationVault: openVault,
  releaseFromCurrentReconciliationState: releaseState,
}));

// Resolve the callback inside async act so storage continuations and layout effects finish together.
function settle(action: () => void): Promise<void> {
  return act(() => Promise.resolve(action()));
}

afterEach(() => { clearSession(); openVault.mockReset(); releaseState.mockReset(); vi.restoreAllMocks(); vi.useRealTimers(); });

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
  await settle(() => { finishRead?.(); });
  expect(await screen.findByText('No records match this view.')).toBeTruthy();
  expect(document.activeElement?.textContent).toBe('Network overview');
  openVault.mockRejectedValueOnce(new Error('private-internal-detail'));
  act(() => { window.dispatchEvent(new Event(RECONCILIATION_VAULT_CHANGE_EVENT)); });
  expect(screen.getByText('Merchant records are being refreshed…')).toBeTruthy();
  expect((await screen.findByRole('alert')).textContent).toContain('GhostPay could not read the encrypted merchant dashboard.');
  expect(screen.queryByText('private-internal-detail')).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Try again' }));
  await settle(() => { notifyAppLock('idle'); finishRead?.(); });
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
  const readState = vi.fn<() => Promise<typeof initial>>().mockResolvedValue(initial);
  openVault.mockResolvedValue({ readState, lock: vi.fn() });
  releaseState.mockImplementation(async (_chain, _seller, release) => {
    const latest = await readState();
    release({
      ...latest,
      invoices: latest.invoices.map((invoice) => ({
        ...invoice, version: 1, nonce: '0'.repeat(32), createdAt: 1, registeredAt: 1000,
      })),
    });
    return true;
  });
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

      renderWith(<AppLean />);
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
