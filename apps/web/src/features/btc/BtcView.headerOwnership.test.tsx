// @vitest-environment jsdom
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makeServices, renderWith } from '../../test/render';
import { BtcView } from './BtcView';
import { EsploraClient } from './esplora';
import { mockChain, SEED_A, walletA } from './fixtures.testutil';
import { EsploraHeaderSource, loadHeaderChain, MemoryHeaderStore, syncHeaders } from './headers';
import { inlineBtcScanWorker } from './scanWorker.testutil';

vi.mock('../../App', () => ({ App: () => null }));

describe('Bitcoin header-load session ownership', () => {
  it('does not let a delayed old-wallet header load discard a newer wallet’s scan', async () => {
    const wallet = walletA(); const oldChain = mockChain('regtest', wallet); const current = mockChain('regtest', wallet, { payments: 2 });
    async function stored(chain: typeof current): Promise<string> {
      const store = new MemoryHeaderStore(); const { chain: headers } = await loadHeaderChain(wallet.net, store);
      const client = new EsploraClient({ baseUrl: 'https://esplora.test/api', fetchFn: chain.fetchFn });
      await syncHeaders({ chain: headers, sources: [new EsploraHeaderSource(client)], store });
      return store.value!;
    }
    const oldHeaders = await stored(oldChain); const newHeaders = await stored(current);
    let release!: (value: string) => void; const delayed = new Promise<string>((resolve) => { release = resolve; });
    let loads = 0;
    class DelayedStore extends MemoryHeaderStore {
      public override load(): Promise<string | undefined> { return ++loads === 1 ? delayed : super.load(); }
    }
    const store = new DelayedStore(); store.value = newHeaders;
    let active = oldChain;
    const user = userEvent.setup();
    renderWith(<BtcView scanWorkerFactory={inlineBtcScanWorker} headerStore={() => store} />, makeServices({ fetchFn: (url, init) => active.fetchFn(url, init) }));
    await user.selectOptions(screen.getByLabelText('Network'), 'regtest');
    await user.type(screen.getByLabelText(/Esplora server URL/), 'https://esplora.test/api');
    await user.type(screen.getByLabelText(/Or import a seed/), SEED_A); await user.click(screen.getByRole('button', { name: 'Import seed' }));
    await user.type(screen.getByLabelText(/First block height/), '1');
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await waitFor(() => expect(loads).toBe(1));
    await user.click(screen.getByRole('button', { name: 'Lock and forget keys' }));
    active = current;
    await user.type(screen.getByLabelText(/Or import a seed/), SEED_A); await user.click(screen.getByRole('button', { name: 'Import seed' }));
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await screen.findByText(/2 unspent payment/);
    await act(async () => { release(oldHeaders); await new Promise((resolve) => { setTimeout(resolve, 50); }); });
    expect(screen.getByText(/2 unspent payment/)).toBeTruthy();
    expect(screen.getAllByRole<HTMLInputElement>('checkbox', { name: /^Sweep / }).every((box) => !box.disabled)).toBe(true);
    expect(screen.queryByText(/results were removed/)).toBeNull();
  });
});
