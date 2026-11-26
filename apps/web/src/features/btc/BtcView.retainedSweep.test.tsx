// @vitest-environment jsdom
// Recovered-from: ba588c82ac831d9cf7cc98e66b9d2d585d12c602 (PR #254, BtcView.spentness.test.tsx additions).
import { bech32 } from '@scure/base';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makeServices, renderWith } from '../../test/render';
import { BtcView } from './BtcView';
import type { EsploraFetch } from './esplora';
import { appendBlocks, coinbase, mockChain, SEED_A, spendTx, walletA } from './fixtures.testutil';
import { MemoryHeaderStore } from './headers';
import { inlineBtcScanWorker } from './scanWorker.testutil';
import * as sweep from './sweep';

// renderWith also exports a full-app helper; these tests exercise only the production Bitcoin view.
vi.mock('../../App', () => ({ App: () => null }));

/** The click handler React captured at the last render: it keeps that render's closure, like a retained async handler. */
function reactOnClick(el: Element): () => void {
  const key = Object.keys(el).find((k) => k.startsWith('__reactProps$'));
  if (key === undefined) throw new Error('no react props');
  return (el as unknown as Record<string, { onClick: () => void }>)[key]!.onClick;
}

async function open(fetchFn: EsploraFetch, props: Parameters<typeof BtcView>[0] = {}) {
  const user = userEvent.setup();
  renderWith(<BtcView scanWorkerFactory={inlineBtcScanWorker} {...props} />, makeServices({ fetchFn }));
  await user.selectOptions(screen.getByLabelText('Network'), 'regtest');
  await user.type(screen.getByLabelText(/Esplora server URL/), 'https://esplora.test/api');
  await user.type(screen.getByLabelText(/Or import a seed/), SEED_A);
  await user.click(screen.getByRole('button', { name: 'Import seed' }));
  await user.type(screen.getByLabelText(/First block height/), '1');
  return user;
}

const DEST = bech32.encode('bcrt', [0, ...bech32.toWords(new Uint8Array(20).fill(3))]);

describe('retained sweep handlers use the current scan', () => {
  it('does not restore old sweep authority when a fee edit occurs during an advanced-header save', async () => {
    const chain = mockChain('regtest', walletA()); const headers = new MemoryHeaderStore();
    const originalSave = headers.save.bind(headers);
    let hold = false; let held = false; let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    headers.save = async (serialized, work) => {
      if (hold) { held = true; await gate; }
      return originalSave(serialized, work);
    };
    const user = await open(chain.fetchFn, { headerStore: () => headers });
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await screen.findByText(/1 unspent payment/);
    await user.click(screen.getByRole('checkbox', { name: /^Sweep / }));
    await user.type(screen.getByLabelText('Destination address'), DEST);
    const fee = screen.getByLabelText('Fee rate (sat/vB)');
    await user.clear(fee); await user.type(fee, '2');
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: /^Sweep / }).checked).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Review sweep' }).disabled).toBe(false);
    const payment = chain.blocks[3]!.txs.find((tx) => tx.vout.some((out) => out.scriptpubkey.startsWith('5120')))!;
    const vout = payment.vout.findIndex((out) => out.scriptpubkey.startsWith('5120'));
    appendBlocks(chain.blocks, [[coinbase(5), spendTx(5, { txid: payment.txid, vout, scriptpubkey: payment.vout[vout]!.scriptpubkey })]]);
    hold = true;
    await user.click(screen.getByRole('button', { name: 'Update headers' }));
    await waitFor(() => expect(held).toBe(true));
    try {
      await user.clear(fee);
      const review = screen.queryByRole<HTMLButtonElement>('button', { name: 'Review sweep' });
      expect(review === null || review.disabled).toBe(true);
    } finally { release(); }
    await waitFor(() => expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Scan' }).disabled).toBe(false));
    expect(screen.queryByText(/1 unspent payment/)).toBeNull();
    const output = screen.queryByRole<HTMLInputElement>('checkbox', { name: /^Sweep / });
    expect(output === null || output.disabled).toBe(true);
    hold = false;
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await screen.findByText(/No unspent payments found/);
    expect(screen.queryByRole('checkbox', { name: /^Sweep / })).toBeNull();
  });

  it('refuses a retained Sign handler after a later provider scan reports the input spent', async () => {
    const chain = mockChain('regtest', walletA()); const user = await open(chain.fetchFn);
    await user.click(screen.getByRole('checkbox', { name: /Also ask the server whether each found output is unspent/ }));
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await screen.findByText(/1 unspent payment/);
    await user.click(screen.getByRole('checkbox', { name: /^Sweep / }));
    await user.type(screen.getByLabelText('Destination address'), DEST);
    await user.click(screen.getByRole('button', { name: 'Review sweep' }));
    await user.click(screen.getByRole('checkbox', { name: /I checked the destination/ }));
    // The handler keeps the render that listed the output as unspent (same chain tip, same provider status).
    const stale = reactOnClick(screen.getByRole('button', { name: 'Sign with software key' }));
    const sign = vi.spyOn(sweep, 'signSweep');
    try {
      const payment = chain.blocks[3]!.txs.find((tx) => tx.vout.some((out) => out.scriptpubkey.startsWith('5120')))!;
      const vout = payment.vout.findIndex((out) => out.scriptpubkey.startsWith('5120'));
      chain.spent.add(`${payment.txid}:${String(vout)}`);
      await user.click(screen.getByRole('button', { name: 'Scan' }));
      await screen.findByText(/No unspent payments found/);
      await act(async () => { stale(); await Promise.resolve(); });
      expect(sign).not.toHaveBeenCalled();
      expect(screen.queryByText('Signed transaction')).toBeNull();
    } finally { sign.mockRestore(); }
  });

  it.each(['Sign', 'Broadcast'] as const)('refuses a retained %s handler after the same chain prefix gains a spending block', async (action) => {
    const chain = mockChain('regtest', walletA()); const user = await open(chain.fetchFn);
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await screen.findByText(/1 unspent payment/);
    await user.click(screen.getByRole('checkbox', { name: /^Sweep / }));
    await user.type(screen.getByLabelText('Destination address'), DEST);
    await user.click(screen.getByRole('button', { name: 'Review sweep' }));
    await user.click(screen.getByRole('checkbox', { name: /I checked the destination/ }));
    if (action === 'Broadcast') {
      await user.click(screen.getByRole('button', { name: 'Sign with software key' }));
      await screen.findByText('Signed transaction');
    }
    const stale = reactOnClick(screen.getByRole('button', { name: action === 'Sign' ? 'Sign with software key' : /Broadcast to/ }));
    const sign = vi.spyOn(sweep, 'signSweep');
    try {
      const payment = chain.blocks[3]!.txs.find((tx) => tx.vout.some((out) => out.scriptpubkey.startsWith('5120')))!;
      const vout = payment.vout.findIndex((out) => out.scriptpubkey.startsWith('5120'));
      appendBlocks(chain.blocks, [[coinbase(5), spendTx(5, { txid: payment.txid, vout, scriptpubkey: payment.vout[vout]!.scriptpubkey })]]);
      await user.click(screen.getByRole('button', { name: 'Update headers' }));
      await screen.findByText(/Spent status: unknown/);
      await waitFor(() => expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Scan' }).disabled).toBe(false));
      await act(async () => { stale(); await Promise.resolve(); });
      expect(sign).not.toHaveBeenCalled();
      expect(chain.broadcasts).toEqual([]);
      expect(screen.queryByText('Signed transaction')).toBeNull();
    } finally { sign.mockRestore(); }
  });
});
