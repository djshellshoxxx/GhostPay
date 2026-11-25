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
import { appendBlocks, coinbase, mockChain, SEED_A, spendTx, walletA } from './fixtures.testutil';
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

  it('releases the guard once a later local scan confirms the spend', async () => {
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
});
