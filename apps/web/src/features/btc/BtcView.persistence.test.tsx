// @vitest-environment jsdom
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { makeServices, renderWith } from '../../test/render';
import type { ReconciliationVaultStore } from '../../lib/reconciliationVault';
import { BtcView } from './BtcView';
import { inlineBtcScanWorker } from './scanWorker.testutil';
import { mockChain, SEED_A, walletA, type MockChain } from './fixtures.testutil';
import { MemoryHeaderStore } from './headers';

class Store implements ReconciliationVaultStore {
  readonly values = new Map<string, string>();
  read(key: string): Promise<string | null> { return Promise.resolve(this.values.get(key) ?? null); }
  compareAndSwap(key: string, expected: string | null, next: string, guard: () => void): Promise<boolean> {
    guard(); if ((this.values.get(key) ?? null) !== expected) return Promise.resolve(false);
    this.values.set(key, next); return Promise.resolve(true);
  }
}
async function open(chain: MockChain, store: Store, headers: MemoryHeaderStore) {
  const user = userEvent.setup();
  renderWith(<BtcView scanWorkerFactory={inlineBtcScanWorker} scanStore={store} headerStore={() => headers} />, makeServices({ fetchFn: chain.fetchFn }));
  await user.selectOptions(screen.getByLabelText('Network'), 'regtest');
  await user.type(screen.getByLabelText(/Esplora server URL/), 'https://esplora.test/api');
  await user.type(screen.getByLabelText(/Or import a seed/), SEED_A);
  await user.click(screen.getByRole('button', { name: 'Import seed' }));
  return user;
}
async function enable(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('checkbox', { name: 'Save scan progress encrypted in this browser' }));
  await waitFor(() => expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Scan' }).disabled).toBe(false));
}

describe('Bitcoin encrypted restart UI', () => {
  it('opts in locally, restores cursor after remount, and revalidates saved outputs before offering a sweep', async () => {
    const chain = mockChain('regtest', walletA()); const store = new Store(); const headers = new MemoryHeaderStore();
    let user = await open(chain, store, headers);
    expect(store.values.size).toBe(0); await enable(user); expect(chain.requests).toHaveLength(0);
    await user.type(screen.getByLabelText(/First block height/), '1');
    await user.click(screen.getByRole('button', { name: 'Scan' })); await screen.findByText(/1 unspent payment/);
    expect(store.values.size).toBe(1); expect(JSON.stringify([...store.values])).not.toContain(SEED_A);
    cleanup(); chain.requests.length = 0;
    user = await open(chain, store, headers); await enable(user);
    await screen.findByText(/Saved scan: birth height 1, checked through 4, 1 historical matches/);
    expect(chain.requests).toHaveLength(0);
    expect(screen.queryByRole('checkbox', { name: /^Sweep / })).toBeNull();
    expect(screen.getByLabelText<HTMLInputElement>(/First block height/).value).toBe('1');
    await user.click(screen.getByRole('button', { name: 'Scan' })); await screen.findByText(/1 unspent payment/);
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: /^Sweep / }).checked).toBe(false);
    expect(chain.requests).toContain('GET /block-height/3');
    expect(chain.requests).not.toContain('GET /block-height/1');
  });

  it('requires explicit deletion and does not restore a cursor after its tombstone', async () => {
    const chain = mockChain('regtest', walletA()); const store = new Store(); const headers = new MemoryHeaderStore();
    const user = await open(chain, store, headers); await enable(user);
    await user.type(screen.getByLabelText(/First block height/), '1');
    await user.click(screen.getByRole('button', { name: 'Scan' })); await screen.findByText(/1 unspent payment/);
    const before = JSON.stringify([...store.values]);
    await user.click(screen.getByRole('button', { name: 'Forget saved scan progress' }));
    expect(JSON.stringify([...store.values])).toBe(before);
    await user.click(screen.getByRole('button', { name: 'Delete saved scan progress' }));
    await waitFor(() => expect(screen.queryByText(/Saved scan: birth height/)).toBeNull());
    const tombstone: unknown = JSON.parse([...store.values.values()][0]!);
    expect(tombstone).toMatchObject({ version: 1, forgotten: true });
    expect((tombstone as { nonce: unknown }).nonce).toMatch(/^[0-9a-f]{64}$/);
    await user.click(screen.getByRole('button', { name: 'Reload saved scan progress' }));
    await waitFor(() => expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Scan' }).disabled).toBe(false));
    expect(screen.queryByRole('checkbox', { name: /^Sweep / })).toBeNull();
  });
});
