// @vitest-environment jsdom
// FC-05a reviewer L3: default local spentness cannot see mempool spends, so a rescan right after a broadcast must not
// offer the just-swept inputs again.
import { bech32 } from '@scure/base';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makeServices, renderWith } from '../../test/render';
import { BtcView } from './BtcView';
import type { EsploraFetch } from './esplora';
import { appendBlocks, coinbase, forkChain, mockChain, SEED_A, spendTx, walletA } from './fixtures.testutil';
import { inlineBtcScanWorker } from './scanWorker.testutil';

// renderWith also exports a full-app helper; these tests exercise only the production Bitcoin view.
vi.mock('../../App', () => ({ App: () => null }));

const DEST = bech32.encode('bcrt', [0, ...bech32.toWords(new Uint8Array(20).fill(3))]);
const PENDING = /Pending spend/;

async function seed(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.type(screen.getByLabelText(/Or import a seed/), SEED_A);
  await user.click(screen.getByRole('button', { name: 'Import seed' }));
  await user.type(screen.getByLabelText(/First block height/), '1');
}

async function open(fetchFn: EsploraFetch) {
  const user = userEvent.setup();
  renderWith(<BtcView scanWorkerFactory={inlineBtcScanWorker} />, makeServices({ fetchFn }));
  await user.selectOptions(screen.getByLabelText('Network'), 'regtest');
  await user.type(screen.getByLabelText(/Esplora server URL/), 'https://esplora.test/api');
  await seed(user);
  return user;
}

async function broadcastSweep(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'Scan' }));
  await screen.findByText(/1 unspent payment/);
  await user.click(screen.getByRole('checkbox', { name: /^Sweep / }));
  await user.type(screen.getByLabelText('Destination address'), DEST);
  await user.click(screen.getByRole('button', { name: 'Review sweep' }));
  await user.click(screen.getByRole('checkbox', { name: /I checked the destination/ }));
  await user.click(screen.getByRole('button', { name: 'Sign with software key' }));
  await screen.findByText('Signed transaction');
  await user.click(screen.getByRole('button', { name: /Broadcast to/ }));
  await waitFor(() => expect(screen.getByRole('button', { name: /Broadcast to/ }).hasAttribute('disabled')).toBe(true));
}

describe('session pending-spend guard', () => {
  it('keeps inputs of a broadcast transaction unsweepable after a rescan that cannot see the mempool', async () => {
    const chain = mockChain('regtest', walletA()); const user = await open(chain.fetchFn);
    await broadcastSweep(user);
    expect(chain.broadcasts).toHaveLength(1);
    // The spend is only in the mempool: the confirmed blocks are unchanged, so the local scan lists the output again.
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await waitFor(() => expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Scan' }).disabled).toBe(false));
    const box = screen.getByRole<HTMLInputElement>('checkbox', { name: /^Sweep / });
    expect(box.disabled).toBe(true);
    expect(box.checked).toBe(false);
    expect(screen.getByText(PENDING)).toBeTruthy();
    const review = screen.queryByRole<HTMLButtonElement>('button', { name: 'Review sweep' });
    expect(review === null || review.disabled).toBe(true);
  });

  it('stops listing the output, and so the notice, once a later local scan confirms the spend', async () => {
    const chain = mockChain('regtest', walletA()); const user = await open(chain.fetchFn);
    await broadcastSweep(user);
    const payment = chain.blocks[3]!.txs.find((tx) => tx.vout.some((out) => out.scriptpubkey.startsWith('5120')))!;
    const vout = payment.vout.findIndex((out) => out.scriptpubkey.startsWith('5120'));
    appendBlocks(chain.blocks, [[coinbase(5), spendTx(5, { txid: payment.txid, vout, scriptpubkey: payment.vout[vout]!.scriptpubkey })]]);
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await screen.findByText(/No unspent payments found/);
    expect(screen.queryByText(PENDING)).toBeNull();
  });

  it('forgets the guard when the session is locked and the wallet is imported again', async () => {
    const chain = mockChain('regtest', walletA()); const user = await open(chain.fetchFn);
    await broadcastSweep(user);
    await user.click(screen.getByRole('button', { name: 'Lock and forget keys' }));
    await user.selectOptions(screen.getByLabelText('Network'), 'regtest');
    const esplora = screen.getByLabelText<HTMLInputElement>(/Esplora server URL/);
    if (esplora.value === '') await user.type(esplora, 'https://esplora.test/api');
    await user.type(screen.getByLabelText(/Or import a seed/), SEED_A);
    await user.click(screen.getByRole('button', { name: 'Import seed' }));
    const first = screen.getByLabelText<HTMLInputElement>(/First block height/);
    if (first.value === '') await user.type(first, '1');
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await screen.findByText(/1 unspent payment/);
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: /^Sweep / }).disabled).toBe(false);
    expect(screen.queryByText(PENDING)).toBeNull();
  });

  // FC-05b review M1: the swept transaction stays valid across a reorganization, so its inputs stay unsweepable.
  it('keeps the guard through a chain reorganization that cuts the scan above the paying block', async () => {
    const chain = mockChain('regtest', walletA()); const user = await open(chain.fetchFn);
    await broadcastSweep(user);
    // Block 4 (above the payment in block 3) is replaced by a heavier two-block branch.
    forkChain(chain.blocks, 4, 2, 7);
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await screen.findByText(/1 unspent payment/);
    await waitFor(() => expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Scan' }).disabled).toBe(false));
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: /^Sweep / }).disabled).toBe(true);
    expect(screen.getByText(PENDING)).toBeTruthy();
  });

  // FC-05b review L2: re-sending the identical signed transaction cannot double-spend; signing a new one stays refused.
  it('allows broadcasting the identical signed transaction again after an unknown outcome', async () => {
    const chain = mockChain('regtest', walletA()); const user = await open(chain.fetchFn);
    chain.broadcastStatus = 500;
    await broadcastSweep(user);
    await waitFor(() => expect(document.querySelector('[data-transaction-phase="broadcast-unknown"]')).not.toBeNull());
    expect(chain.broadcasts).toHaveLength(0);
    chain.broadcastStatus = undefined;
    const again = screen.getByRole<HTMLButtonElement>('button', { name: /Broadcast to/ });
    expect(again.disabled).toBe(false);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Sign with software key' }).disabled).toBe(true);
    await user.click(again);
    await waitFor(() => expect(chain.broadcasts).toHaveLength(1));
    await waitFor(() => expect(document.querySelector('[data-transaction-phase="pending-confirmation"]')).not.toBeNull());
  });

  // FC-05b review M2: the notice says the protection lives only in this page's memory.
  it('says the guard is memory-only and survives neither reload nor lock', async () => {
    const chain = mockChain('regtest', walletA()); const user = await open(chain.fetchFn);
    await broadcastSweep(user);
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    const text = (await screen.findByText(PENDING)).textContent ?? '';
    expect(text).toMatch(/only in this page's memory/);
    expect(text).toMatch(/reloading the page/);
    expect(text).toMatch(/same signed transaction again/);
    expect(text).not.toMatch(/reorganization cuts the scan/);
  });
});
