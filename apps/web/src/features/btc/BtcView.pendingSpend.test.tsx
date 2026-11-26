// @vitest-environment jsdom
// FC-05a reviewer L3: default local spentness cannot see mempool spends, so a rescan right after a broadcast must not
// offer the just-swept inputs again.
import { parseHeader } from '@ghostpay/btc-silent-payments';
import { bech32 } from '@scure/base';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makeServices, renderWith } from '../../test/render';
import { BtcView } from './BtcView';
import type { EsploraFetch } from './esplora';
import { appendBlocks, blockTime, coinbase, mineHeader, mockChain, SEED_A, spendTx, walletA, type MockChain } from './fixtures.testutil';
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
  await waitFor(() => {
    const phase = document.querySelector('[data-transaction-phase]')?.getAttribute('data-transaction-phase');
    expect(phase === 'pending-confirmation' || phase === 'broadcast-unknown').toBe(true);
  });
}

/**
 * Replaces block 3 (the paying block) and above with a heavier branch whose new block 3 re-mines the same payment
 * transaction: the paying block leaves the checked chain, then the same output (same txid:vout) is found again.
 */
function remineThePayingBlock(chain: MockChain): void {
  const paying = chain.blocks[3]!;
  chain.blocks.splice(3);
  for (const txs of [[coinbase(0x7a0), ...paying.txs.slice(1)], [coinbase(0x7a1)], [coinbase(0x7a2)]]) {
    const height = chain.blocks.length;
    const header = mineHeader(chain.blocks[height - 1]!.hash, txs, 0x207fffff, blockTime(height, 9));
    chain.blocks.push({ hash: parseHeader(header).hash, header, txs });
  }
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

  // FC-05b review M1: the swept transaction stays valid across a reorganization, so its inputs stay unsweepable. The
  // header update runs against the live scan (applyChainToScan), which is where the marks used to be cleared.
  it('keeps the guard when a header update drops the paying block and a rescan finds the output re-mined', async () => {
    const chain = mockChain('regtest', walletA()); const user = await open(chain.fetchFn);
    await broadcastSweep(user);
    remineThePayingBlock(chain);
    await user.click(screen.getByRole('button', { name: 'Update headers' }));
    await screen.findByText(/Block headers checked on this device from the pinned genesis block to height 5 /);
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await screen.findByText(/1 unspent payment/);
    await waitFor(() => expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Scan' }).disabled).toBe(false));
    const box = screen.getByRole<HTMLInputElement>('checkbox', { name: /^Sweep / });
    expect(box.disabled).toBe(true);
    expect(box.checked).toBe(false);
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
  it('says the guard is memory-only, survives reorganizations, and promises no rebroadcast after a scan', async () => {
    const chain = mockChain('regtest', walletA()); const user = await open(chain.fetchFn);
    await broadcastSweep(user);
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    const text = (await screen.findByText(PENDING)).textContent ?? '';
    expect(text).toMatch(/only in this page's memory/);
    expect(text).toMatch(/reloading the page/);
    expect(text).toMatch(/also across a chain reorganization/);
    expect(text).toMatch(/no longer listed/);
    // The notice appears only after a scan, which clears the signed transaction: it must not promise a rebroadcast.
    expect(text).not.toMatch(/broadcast the same signed transaction/);
    expect(text).not.toMatch(/reorganization cuts the scan/);
  });
});
