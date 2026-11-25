// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WalletAttempts } from './WalletAttempts';
import { ATTEMPT_JOURNAL_KEY, attemptTxDigest, beginAttempt, finishAttempt, readAttempts } from '../lib/duplicateAttemptJournal';
import { mockRpc } from '../test/mockRpc';

beforeEach(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it('keeps unknown outcomes until the user explicitly confirms clearing', async () => {
  beginAttempt({ key: `0x${'a'.repeat(64)}`, chainId: 1, account: `0x${'1'.repeat(40)}`, kind: 'payment' }, window.localStorage);
  render(<WalletAttempts />);
  expect(screen.getByText(/outcome unknown/i)).toBeTruthy();
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  fireEvent.click(screen.getByRole('button', { name: 'Clear this attempt after checking my wallet' }));
  expect(readAttempts()).toHaveLength(1);
  confirm.mockReturnValue(true);
  fireEvent.click(screen.getByRole('button', { name: 'Clear this attempt after checking my wallet' }));
  await waitFor(() => { expect(readAttempts()).toHaveLength(0); });
});

it('refreshes after a cross-tab write and resolves only after a user asks the recorded chain RPC', async () => {
  const from = `0x${'1'.repeat(40)}`;
  const to = `0x${'2'.repeat(40)}`;
  const hash = `0x${'b'.repeat(64)}`;
  const blockHash = `0x${'c'.repeat(64)}`;
  let failure = false;
  const rpc = mockRpc(1, (method) => {
    if (failure) throw new Error('upstream deadline expired');
    switch (method) {
      case 'eth_getTransactionByHash':
        return { hash, from, to, value: '0x1', input: '0x', chainId: '0x1', nonce: '0x1', blockNumber: '0x1', blockHash };
      case 'eth_getTransactionReceipt': return { transactionHash: hash, to, status: '0x1', blockNumber: '0x1', blockHash };
      case 'eth_getBlockByNumber': return { hash: blockHash, parentHash: `0x${'0'.repeat(64)}` };
      case 'eth_blockNumber': return '0x40';
      default: throw new Error('unexpected method');
    }
  });
  const getRpc = vi.fn(() => Promise.resolve(rpc));
  render(<WalletAttempts getRpc={getRpc} />);
  // Update the store without the in-tab event, then deliver the StorageEvent another tab would get.
  const records: string[] = [];
  const otherTab = {
    getItem: () => records.at(-1) ?? null,
    setItem: (_key: string, value: string) => { records.push(value); },
  };
  const attempt = beginAttempt({ key: hash, chainId: 1, account: from, kind: 'payment', txDigest: attemptTxDigest(1, from, to, '0x', 1n) }, otherTab);
  finishAttempt(attempt, hash, otherTab);
  window.localStorage.setItem(ATTEMPT_JOURNAL_KEY, records.at(-1) ?? '[]');
  fireEvent(window, new StorageEvent('storage', { key: ATTEMPT_JOURNAL_KEY }));

  const check = await screen.findByRole('button', { name: 'Check status on my RPC' });
  expect(getRpc).not.toHaveBeenCalled();
  fireEvent.click(check);
  expect(await screen.findByText('The RPC confirmed execution of this transaction.')).toBeTruthy();
  expect(getRpc).toHaveBeenCalledWith(1);
  failure = true;
  fireEvent.click(check);
  expect(await screen.findByText(/Outcome unknown. Keep tracking this attempt/)).toBeTruthy();
  expect(readAttempts()).toMatchObject([{ hash, status: 'submitted' }]);
});
