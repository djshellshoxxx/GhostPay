// @vitest-environment jsdom
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makeServices, renderWith } from '../../test/render';
import { BtcView } from './BtcView';
import { mockChain, SEED_A, walletA } from './fixtures.testutil';
import type { EsploraFetch } from './esplora';
import type { BtcScanWorkerFactory } from './scanWorkerClient';
import { InlineBtcScanWorker, inlineBtcScanWorker } from './scanWorker.testutil';

// renderWith also exports a full-app helper; these tests exercise only the production Bitcoin view.
vi.mock('../../App', () => ({ App: () => null }));

const providerBox = (): HTMLInputElement => screen.getByRole('checkbox', { name: /Also ask the server whether each found output is unspent|Allow required provider checks for this light scan/ });
async function ready(fetchFn: EsploraFetch, factory: BtcScanWorkerFactory = inlineBtcScanWorker) {
  const user = userEvent.setup();
  renderWith(<BtcView scanWorkerFactory={factory} />, makeServices({ fetchFn }));
  await user.selectOptions(screen.getByLabelText('Network'), 'regtest');
  await user.type(screen.getByLabelText(/Esplora server URL/), 'https://esplora.test/api');
  await user.type(screen.getByLabelText(/Or import a seed/), SEED_A);
  await user.click(screen.getByRole('button', { name: 'Import seed' }));
  await user.type(screen.getByLabelText(/First block height/), '1');
  return user;
}

describe('Bitcoin spent-check consent and unknown results', () => {
  it('revokes provider checks while scanning, aborts the pending request, and never resumes later optional checks', async () => {
    const chain = mockChain('regtest', walletA(), { payments: 2 });
    let release!: (response: Response) => void; let signal: AbortSignal | null | undefined;
    const requests: string[] = [];
    const user = await ready((url, init) => {
      requests.push(url);
      if (url.includes('/outspend/')) {
        signal = init.signal;
        return new Promise<Response>((resolve) => { release = resolve; });
      }
      return chain.fetchFn(url, init);
    });
    await user.click(providerBox());
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await waitFor(() => expect(requests.filter((url) => url.includes('/outspend/'))).toHaveLength(1));
    expect(providerBox().disabled).toBe(false);
    await user.click(providerBox());
    expect(providerBox().checked).toBe(false);
    expect(signal?.aborted).toBe(true);
    await act(async () => { release(new Response('{"spent":false}')); await Promise.resolve(); });
    expect(requests.filter((url) => url.includes('/outspend/'))).toHaveLength(1);
    expect(screen.queryByRole('checkbox', { name: /^Sweep / })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await screen.findByText(/2 unspent payment/);
    expect(requests.filter((url) => url.includes('/outspend/'))).toHaveLength(1);
  });

  it('does not carry mandatory light-mode disclosure into a later full Esplora scan', async () => {
    const chain = mockChain('regtest', walletA()); const user = await ready(chain.fetchFn);
    await user.selectOptions(screen.getByLabelText('Additional scan source'), 'http');
    await user.click(screen.getByLabelText('Use light oracle scans with transaction inclusion proofs'));
    expect(providerBox().checked).toBe(false);
    expect(providerBox().disabled).toBe(false);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Scan' }).disabled).toBe(true);
    expect(chain.requests).toHaveLength(0);
    await user.click(providerBox()); expect(providerBox().checked).toBe(true);
    await user.selectOptions(screen.getByLabelText('Additional scan source'), 'none');
    expect(providerBox().checked).toBe(false);
    expect(providerBox().disabled).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await screen.findByText(/1 unspent payment/);
    expect(chain.requests.some((r) => r.includes('/outspend/'))).toBe(false);
  });

  it('requires new optional consent after changing the selected provider', async () => {
    const chain = mockChain('regtest', walletA()); const user = await ready(chain.fetchFn);
    await user.click(providerBox()); expect(providerBox().checked).toBe(true);
    await user.type(screen.getByLabelText(/Esplora server URL/), '/new-provider');
    expect(providerBox().checked).toBe(false);
    expect(chain.requests).toHaveLength(0);
  });

  it('keeps unknown discoveries visible but never describes or selects them as unspent', async () => {
    const chain = mockChain('regtest', walletA());
    const unknownResult: BtcScanWorkerFactory = () => {
      const worker = new InlineBtcScanWorker(); const post = worker.postMessage.bind(worker);
      worker.postMessage = (message): void => {
        if (message.type === 'start') {
          const handler = worker.onmessage;
          worker.onmessage = ({ data }): void => {
            handler?.({ data: data.type === 'done' ? { ...data, result: { ...data.result, spentStatus: 'unknown' } } : data });
          };
        }
        post(message);
      };
      return worker;
    };
    const user = await ready(chain.fetchFn, unknownResult);
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await screen.findByRole('checkbox', { name: /^Sweep / });
    expect(screen.queryByText(/1 unspent payment/)).toBeNull();
    const sweep = screen.getByRole<HTMLInputElement>('checkbox', { name: /^Sweep / });
    expect(sweep.disabled).toBe(true); expect(sweep.checked).toBe(false);
    await user.click(sweep);
    expect(sweep.checked).toBe(false);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Review sweep' }).disabled).toBe(true);
  });
});
