// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AttemptResolution } from '../lib/attemptStatus';
import { ATTEMPT_JOURNAL_KEY, attemptTxDigest, beginAttempt, finishAttempt } from '../lib/duplicateAttemptJournal';
import { mockRpc } from '../test/mockRpc';

const outcome = vi.hoisted(() => ({ next: undefined as AttemptResolution | undefined }));
vi.mock('../lib/attemptStatus', async (actual) => ({
  ...await actual<typeof import('../lib/attemptStatus')>(),
  resolveAttempt: () => Promise.resolve(outcome.next),
}));
const { WalletAttempts } = await import('./WalletAttempts');

const from = `0x${'1'.repeat(40)}`;
const hash = `0x${'b'.repeat(64)}`;
const other: `0x${string}` = `0x${'d'.repeat(64)}`;
const blockHash: `0x${string}` = `0x${'c'.repeat(64)}`;

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  const records: string[] = [];
  const store = { getItem: () => records.at(-1) ?? null, setItem: (_k: string, v: string) => { records.push(v); } };
  const attempt = beginAttempt({ key: hash, chainId: 1, account: from, kind: 'payment', txDigest: attemptTxDigest(1, from, from, '0x', 1n) }, store);
  finishAttempt(attempt, hash, store);
  window.localStorage.setItem(ATTEMPT_JOURNAL_KEY, records.at(-1) ?? '[]');
});

// Unmount before the next test and before jsdom teardown, so the mount-time journal migration cannot settle into a
// component whose window is gone (an unhandled rejection that fails the run).
afterEach(cleanup);

async function statusFor(next: AttemptResolution): Promise<string> {
  outcome.next = next;
  render(<WalletAttempts getRpc={() => Promise.resolve(mockRpc(1, () => { throw new Error('not used'); }))} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Check status on my RPC' }));
  return (await screen.findByRole('status')).textContent ?? '';
}

it('warns, instead of reporting an unknown outcome, when the RPC shows a different call under the hash', async () => {
  expect(await statusFor({ state: 'mismatch', field: 'txDigest' })).toMatch(/^Warning: your RPC shows a different transaction/);
});

it('says the nonce was used by another transaction instead of reporting an unknown outcome', async () => {
  expect(await statusFor({ state: 'nonce-consumed', nonce: 3, accountNonce: 4n })).toMatch(/already used its nonce/);
});

it('never words a confirmed cancel replacement as the original action confirming', async () => {
  const text = await statusFor({
    state: 'replaced', hash: other, kind: 'different-call',
    outcome: { state: 'confirmed', blockNumber: 1n, blockHash, confirmations: 1_000n },
  });
  expect(text).toMatch(/runs a different call, for example a cancel/);
  expect(text).toMatch(/The original action did not run in this transaction/);
});

it('keeps the plain replacement wording for a same-call speed-up', async () => {
  const text = await statusFor({
    state: 'replaced', hash: other, kind: 'same-call',
    outcome: { state: 'confirmed', blockNumber: 1n, blockHash, confirmations: 1_000n },
  });
  expect(text).toMatch(/^Linked replacement/);
  expect(text).not.toMatch(/different call/);
});
