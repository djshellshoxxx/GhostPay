// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makeServices, renderWith } from '../../test/render';
import { BtcView } from './BtcView';
import { mockChain, SEED_A, walletA } from './fixtures.testutil';
import type { EsploraFetch } from './esplora';
import type { BtcScanWorkerFactory } from './scanWorkerClient';
import { inlineBtcScanWorker } from './scanWorker.testutil';

vi.mock('../../App', () => ({ App: () => null }));

// Recover the endpoint-change case from PR #244, source 981cc2f4395d2d76c499a5cd46387daaaa3a6b1f.
// Its separate light-scan opt-in model is superseded by the current disclosed mandatory checks.
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

describe('Bitcoin endpoint-bound optional spent-check consent', () => {
  it('requires new optional consent after changing the selected provider', async () => {
    const chain = mockChain('regtest', walletA()); const user = await ready(chain.fetchFn);
    await user.click(providerBox()); expect(providerBox().checked).toBe(true);
    await user.type(screen.getByLabelText(/Esplora server URL/), '/new-provider');
    expect(providerBox().checked).toBe(false);
    expect(chain.requests).toHaveLength(0);
  });
});
