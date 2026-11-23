// @vitest-environment jsdom
import { createScanState, type ScanState } from '@ghostpay/btc-silent-payments';
import { bech32 } from '@scure/base';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makeServices, renderWith } from '../../test/render';
import type { ReconciliationVaultStore } from '../../lib/reconciliationVault';
import { BtcView } from './BtcView';
import { EsploraClient, type EsploraFetch } from './esplora';
import { appendBlocks, coinbase, mockChain, SEED_A, spendTx, walletA } from './fixtures.testutil';
import { EsploraHeaderSource, loadHeaderChain, MemoryHeaderStore, syncHeaders } from './headers';
import { scanForPayments, wipeFound } from './scan';
import { BtcScanVault } from './scanStore';
import { InlineBtcScanWorker, inlineBtcScanWorker } from './scanWorker.testutil';
import * as sweep from './sweep';

const consentName = /Also ask the server whether each found output is unspent/;

function reactOnClick(el: Element): () => void {
  const key = Object.keys(el).find((k) => k.startsWith('__reactProps$'));
  if (key === undefined) throw new Error('no react props');
  return (el as unknown as Record<string, { onClick: () => void }>)[key]!.onClick;
}

class Store implements ReconciliationVaultStore {
  readonly values = new Map<string, string>();
  read(key: string): Promise<string | null> { return Promise.resolve(this.values.get(key) ?? null); }
  compareAndSwap(key: string, expected: string | null, next: string, guard: () => void): Promise<boolean> {
    guard(); if ((this.values.get(key) ?? null) !== expected) return Promise.resolve(false);
    this.values.set(key, next); return Promise.resolve(true);
  }
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

describe('Bitcoin spentness consent and unknown UI', () => {
  it('clears the light-mode provider requirement when returning to the full local source', async () => {
    const chain = mockChain('regtest', walletA()); const user = await open(chain.fetchFn);
    await user.selectOptions(screen.getByLabelText('Additional scan source'), 'http');
    await user.click(screen.getByLabelText('Use light oracle scans with transaction inclusion proofs'));
    const consent = screen.getByRole<HTMLInputElement>('checkbox', { name: consentName });
    expect(consent.checked).toBe(true); expect(consent.disabled).toBe(true);
    await user.selectOptions(screen.getByLabelText('Additional scan source'), 'none');
    expect(consent.checked).toBe(false); expect(consent.disabled).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await screen.findByText(/1 unspent payment/);
    expect(chain.requests.some((path) => path.includes('/outspend/'))).toBe(false);
  });

  it('revokes provider consent during a running scan and ignores its late response', async () => {
    const chain = mockChain('regtest', walletA(), { payments: 2 });
    let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
    let requested = 0; let requestSignal: AbortSignal | null | undefined;
    const workers: InlineBtcScanWorker[] = [];
    const user = await open(async (url, init) => {
      if (url.includes('/outspend/')) { requested++; requestSignal = init.signal; await gate; }
      return chain.fetchFn(url, init);
    }, { scanWorkerFactory: () => { const worker = new InlineBtcScanWorker(); workers.push(worker); return worker; } });
    const consent = screen.getByRole<HTMLInputElement>('checkbox', { name: consentName });
    await user.click(consent);
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await waitFor(() => expect(requested).toBe(1));
    expect(consent.disabled).toBe(false);
    await user.click(consent);
    expect(requestSignal?.aborted).toBe(true); expect(workers[0]!.terminated).toBe(true);
    release();
    await waitFor(() => expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Scan' }).disabled).toBe(false));
    expect(screen.queryByRole('checkbox', { name: /^Sweep / })).toBeNull();
    expect(requested).toBe(1);
    chain.requests.length = 0;
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await screen.findByText(/2 unspent payment/);
    expect(requested).toBe(1); expect(chain.requests.some((path) => path.includes('/outspend/'))).toBe(false);
  });

  it('does not let a cancelled old header load replace the checked tip of a later scan', async () => {
    const chain = mockChain('regtest', walletA()); const headers = new MemoryHeaderStore();
    let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
    let loading = false; let first = true;
    headers.load = async () => {
      if (first) { first = false; loading = true; await gate; return undefined; }
      return headers.value;
    };
    const user = await open(chain.fetchFn, { headerStore: () => headers });
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await waitFor(() => expect(loading).toBe(true));
    await user.click(screen.getByRole('button', { name: 'Lock and forget keys' }));
    await user.type(screen.getByLabelText(/Or import a seed/), SEED_A);
    await user.click(screen.getByRole('button', { name: 'Import seed' }));
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await screen.findByText(/1 unspent payment/);
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: /^Sweep / }).disabled).toBe(false);
    await act(async () => { release(); await gate; });
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: /^Sweep / }).disabled).toBe(false);
    expect(screen.queryByText(/above the checked headers \(height 0\)/)).toBeNull();
  });

  it('does not call incomplete local results unspent or offer them for sweeping', async () => {
    const chain = mockChain('regtest', walletA()); const headers = new MemoryHeaderStore();
    const user = await open(chain.fetchFn, { headerStore: () => headers, headerSyncLimits: { headersPerRound: 1, maxRounds: 3 } });
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await screen.findByText(/Spent status: unknown/);
    expect(screen.queryByText(/1 unspent payment/)).toBeNull();
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: /^Sweep / }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Review sweep' }).disabled).toBe(true);
    expect(screen.getByText(/use Forget saved scan progress and rescan/i)).toBeTruthy();
  });

  it('requires a new local scan when checked headers advance beyond the spend coverage', async () => {
    const chain = mockChain('regtest', walletA()); const user = await open(chain.fetchFn);
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await screen.findByText(/1 unspent payment/);
    const payment = chain.blocks[3]!.txs.find((tx) => tx.vout.some((out) => out.scriptpubkey.startsWith('5120')))!;
    const vout = payment.vout.findIndex((out) => out.scriptpubkey.startsWith('5120'));
    appendBlocks(chain.blocks, [[coinbase(5), spendTx(5, { txid: payment.txid, vout, scriptpubkey: payment.vout[vout]!.scriptpubkey })]]);
    await user.click(screen.getByRole('button', { name: 'Update headers' }));
    await screen.findByText(/Spent status: unknown/);
    expect(screen.queryByText(/1 unspent payment/)).toBeNull();
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: /^Sweep / }).disabled).toBe(true);
    expect(screen.queryByText(/no longer on the checked chain/)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await screen.findByText(/No unspent payments found/);
    expect(screen.queryByRole('checkbox', { name: /^Sweep / })).toBeNull();
    expect(chain.requests.some((path) => path.includes('/outspend/'))).toBe(false);
  });

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
    await user.type(screen.getByLabelText('Destination address'), bech32.encode('bcrt', [0, ...bech32.toWords(new Uint8Array(20).fill(3))]));
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

  it.each(['Sign', 'Broadcast'] as const)('refuses a retained %s handler after the same chain prefix gains a spending block', async (action) => {
    const chain = mockChain('regtest', walletA()); const user = await open(chain.fetchFn);
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await screen.findByText(/1 unspent payment/);
    await user.click(screen.getByRole('checkbox', { name: /^Sweep / }));
    await user.type(screen.getByLabelText('Destination address'), bech32.encode('bcrt', [0, ...bech32.toWords(new Uint8Array(20).fill(3))]));
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

  it('restores legacy outputs as unknown and refreshes them only after explicit provider consent', async () => {
    const wallet = walletA(); const chain = mockChain('regtest', wallet); const store = new Store(); const headerStore = new MemoryHeaderStore();
    const client = new EsploraClient({ baseUrl: 'https://esplora.test/api', fetchFn: chain.fetchFn });
    const { chain: headers } = await loadHeaderChain(wallet.net, headerStore);
    await syncHeaders({ chain: headers, sources: [new EsploraHeaderSource(client)], store: headerStore });
    let saved: ScanState = createScanState('regtest', 1);
    const first = await scanForPayments({ client, wallet, headers, fromHeight: 1, resumeState: saved, onState: (state) => { saved = state; } });
    wipeFound(first.found);
    const vault = await BtcScanVault.open(wallet, store, () => {});
    await vault.load();
    await vault.save({ ...saved, matches: saved.matches.map((m) => {
      const legacy = { ...m }; delete legacy.spentCheckedThrough; return legacy;
    }) }); vault.lock();
    chain.requests.length = 0;
    const user = await open(chain.fetchFn, { scanStore: store, headerStore: () => headerStore });
    await user.click(screen.getByRole('checkbox', { name: 'Save scan progress encrypted in this browser' }));
    await screen.findByText(/Saved scan: birth height 1, checked through 4, 1 historical matches/);
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await screen.findByText(/Spent status: unknown/);
    expect(screen.queryByText(/1 unspent payment/)).toBeNull();
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: /^Sweep / }).disabled).toBe(true);
    expect(chain.requests.some((path) => path.includes('/outspend/'))).toBe(false);
    await user.click(screen.getByRole('checkbox', { name: consentName }));
    expect(screen.queryByRole('checkbox', { name: /^Sweep / })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await screen.findByText(/Spent status: the selected Esplora server was asked/);
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: /^Sweep / }).disabled).toBe(false);
    expect(chain.requests.some((path) => path.includes('/outspend/'))).toBe(true);
  });
});
