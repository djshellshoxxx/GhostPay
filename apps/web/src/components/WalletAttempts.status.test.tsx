// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AttemptResolution } from '../lib/attemptStatus';
import * as journal from '../lib/duplicateAttemptJournal';
import { ATTEMPT_JOURNAL_KEY, attemptTxDigest, beginAttempt, finishAttempt } from '../lib/duplicateAttemptJournal';
import * as errors from '../lib/errors';
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
// Unmount before the next test and before jsdom teardown; restore the migration/error spies for the next fixture.
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function statusFor(next: AttemptResolution): Promise<string> {
  outcome.next = next;
  // The status assertion can finish before the real IndexedDB migration. Own that
  // promise so neither its notifications nor its rejection outlive this fixture.
  const migrate = journal.migrateBrowserAttempts;
  let migration: Promise<void> | undefined;
  vi.spyOn(journal, 'migrateBrowserAttempts').mockImplementation(() => {
    migration = migrate();
    return migration;
  });
  render(<WalletAttempts getRpc={() => Promise.resolve(mockRpc(1, () => { throw new Error('not used'); }))} />);
  expect(migration).toBeDefined();
  await act(async () => { await migration; });
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

// #286 item 5: a live region reports the result without reading a transaction hash aloud. The linked replacement's
// hash stays on screen, outside the live region, so the user can still compare it with the wallet.
it.each(['same-call', 'different-call'] as const)('keeps the linked %s replacement hash out of the live status region', async (kind) => {
  const text = await statusFor({
    state: 'replaced', hash: other, kind,
    outcome: { state: 'confirmed', blockNumber: 1n, blockHash, confirmations: 1_000n },
  });
  expect(text).not.toContain(other);
  expect(text).not.toMatch(/0x[0-9a-f]{64}/i);
  const shown = screen.getAllByText(other);
  expect(shown.length).toBeGreaterThan(0);
  for (const node of shown) expect(node.closest('[role="status"], [role="alert"], [aria-live]')).toBeNull();
});

it.each(['resolve', 'reject'] as const)('settles a delayed migration %s after the status view unmounts', async (result) => {
  const failure = new Error('synthetic delayed migration refusal');
  let finish = (): void => { throw new Error('migration not initialized'); };
  const migration = new Promise<void>((resolve, reject) => {
    finish = () => { if (result === 'resolve') resolve(); else reject(failure); };
  });
  const migrate = vi.spyOn(journal, 'migrateBrowserAttempts').mockReturnValueOnce(migration);
  const captureError = vi.spyOn(errors, 'captureUserMessage');
  const getRpc = vi.fn(() => Promise.resolve(mockRpc(1, () => { throw new Error('not used'); })));
  const view = render(<WalletAttempts getRpc={getRpc} />);
  expect(migrate).toHaveBeenCalledOnce();
  view.unmount();

  await act(async () => {
    finish();
    if (result === 'resolve') await expect(migration).resolves.toBeUndefined();
    else await expect(migration).rejects.toBe(failure);
  });
  expect(screen.queryByRole('region')).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(captureError).not.toHaveBeenCalled();
  expect(getRpc).not.toHaveBeenCalled();
});
