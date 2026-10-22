// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScanMatch } from '../lib/scanClient';
import { recordFromVerifiedMatch, RECONCILIATION_LEDGER_DATA_KEY, readReconciliationRecords, setReconciliationLedgerEnabled } from '../lib/reconciliationLedger';
import { ReconciliationLedger } from './ReconciliationLedger';

const KEY = 'a'.repeat(64);
const TX = `0x${'b'.repeat(64)}`;
const BLOCK = `0x${'c'.repeat(64)}`;
const ADDRESS = `0x${'d'.repeat(40)}`;
const TOKEN = `0x${'e'.repeat(40)}`;

function verifiedMatch(overrides: Partial<ScanMatch> = {}): ScanMatch {
  return {
    chainId: 84532,
    announcement: {
      id: `${BLOCK}:3`, transactionHash: TX, blockNumber: 120n, blockHash: BLOCK, logIndex: 3,
      schemeId: 1n, caller: `0x${'1'.repeat(40)}`, stealthAddress: ADDRESS,
      ephemeralPublicKey: `0x02${'2'.repeat(64)}`, metadata: '0x',
    },
    stealthAddress: ADDRESS,
    metadata: { kind: 'erc20', token: TOKEN, netAmount: 2500000n, viewTag: 5 },
    viaRouter: true,
    tagMatches: true,
    receipt: 'verified',
    ...overrides,
  } as unknown as ScanMatch;
}

function panel(overrides: Partial<React.ComponentProps<typeof ReconciliationLedger>> = {}) {
  return <ReconciliationLedger chainId={84532} sellerKeyId={KEY} matches={[verifiedMatch()]} scanMatchesCurrentScope onAnnounce={vi.fn()} {...overrides} />;
}

beforeEach(() => { window.localStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('ReconciliationLedger', () => {
  it('requires explicit opt-in and stores only a selected verified scan match', async () => {
    const user = userEvent.setup();
    render(panel());
    expect(screen.getByText(/It is not encrypted/)).toBeTruthy();
    expect(screen.getByText(/seller-signed receipts/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add verified payment to ledger' })).toBeNull();
    expect(window.localStorage.getItem(RECONCILIATION_LEDGER_DATA_KEY)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Enable local ledger on this device' }));
    expect(await screen.findByRole('button', { name: 'Add verified payment to ledger' })).toBeTruthy();
    await user.type(screen.getByLabelText('Invoice digest (optional, manual link)'), `0x${'f'.repeat(64)}`);
    await user.click(screen.getByRole('button', { name: 'Add verified payment to ledger' }));
    expect(await screen.findByText(/Manual invoice link/)).toBeTruthy();
    const stored = readReconciliationRecords();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      sellerKeyId: KEY, chainId: 84532, transactionHash: TX, stealthAddress: ADDRESS,
      asset: TOKEN, amountMinorUnits: '2500000', invoiceDigest: `0x${'f'.repeat(64)}`,
      evidenceStatus: 'verified-at-scan', evidenceSource: 'verified-router-scan',
    });
    expect(window.localStorage.getItem(RECONCILIATION_LEDGER_DATA_KEY)).not.toContain('signature');
    expect(screen.getByText(/not encrypted/)).toBeTruthy();
  });

  it('reloads persisted records, searches within current scope, and exports scoped JSON', async () => {
    setReconciliationLedgerEnabled(true);
    const record = recordFromVerifiedMatch(verifiedMatch(), KEY, `0x${'f'.repeat(64)}`, 1_800_000_000_000);
    window.localStorage.setItem(RECONCILIATION_LEDGER_DATA_KEY, JSON.stringify({ version: 1, records: [record] }));
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:ledger');
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const user = userEvent.setup();
    const { rerender } = render(panel({ matches: [] }));
    expect(await screen.findByText(/1 stored record/)).toBeTruthy();
    expect(screen.getByText(TX)).toBeTruthy();
    await user.type(screen.getByLabelText('Search local records'), `0x${'f'.repeat(64)}`);
    expect(screen.getByText(TX)).toBeTruthy();
    await user.clear(screen.getByLabelText('Search local records'));
    await user.click(screen.getByRole('button', { name: 'Export ledger JSON' }));
    expect(createUrl).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    rerender(panel({ matches: [], chainId: 11155111 }));
    expect(screen.getByText('No records saved.')).toBeTruthy();
    expect(screen.getByText(/Export and delete apply only to this scope/)).toBeTruthy();
  });

  it('hides stale seller or chain matches and never offers claimed announcements for saving', () => {
    setReconciliationLedgerEnabled(true);
    const { rerender } = render(panel({ scanMatchesCurrentScope: false }));
    expect(screen.getByText(/belongs to another chain or seller-key session/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add verified payment to ledger' })).toBeNull();
    rerender(panel({ matches: [verifiedMatch({ receipt: 'claimed' })] }));
    expect(screen.queryByRole('button', { name: 'Add verified payment to ledger' })).toBeNull();
  });

  it('deletes only the current scope, preserves other scopes, and offers global erase when disabling', async () => {
    setReconciliationLedgerEnabled(true);
    const current = recordFromVerifiedMatch(verifiedMatch(), KEY, undefined, 1_800_000_000_000);
    const otherMatch = verifiedMatch({ chainId: 1, announcement: { ...verifiedMatch().announcement, transactionHash: `0x${'9'.repeat(64)}` } as never });
    const other = recordFromVerifiedMatch(otherMatch, 'b'.repeat(64), undefined, 1_800_000_000_001);
    window.localStorage.setItem(RECONCILIATION_LEDGER_DATA_KEY, JSON.stringify({ version: 1, records: [current, other] }));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    render(panel({ matches: [] }));
    await screen.findByText(TX);
    await user.click(screen.getByRole('button', { name: 'Delete ledger records' }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(readReconciliationRecords()).toEqual([other]);
    await user.click(screen.getByRole('button', { name: 'Disable and erase ledger' }));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(readReconciliationRecords()).toEqual([]);
  });

  it('surfaces storage failures and can erase unreadable persisted data', async () => {
    window.localStorage.setItem(RECONCILIATION_LEDGER_DATA_KEY, '{broken');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    render(panel({ matches: [] }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Erase unreadable ledger data' }));
    expect(window.localStorage.getItem(RECONCILIATION_LEDGER_DATA_KEY)).toBeNull();
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota exceeded'); });
    await user.click(screen.getByRole('button', { name: 'Enable local ledger on this device' }));
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toContain('quota exceeded'); });
    expect(setItem).toHaveBeenCalled();
  });
});
