// @vitest-environment jsdom
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { notifyAppLock } from '../../lib/appLock';
import { makeServices, renderWith } from '../../test/render';
import { BtcView } from './BtcView';
import { mockChain, SEED_A, SEED_B, walletA } from './fixtures.testutil';
import { inlineBtcScanWorker } from './scanWorker.testutil';

vi.mock('../../App', () => ({ App: () => null }));

const providerBox = (): HTMLInputElement => screen.getByRole('checkbox', { name: /Also ask the server whether each found output is unspent/ });

async function ready() {
  const chain = mockChain('regtest', walletA());
  const user = userEvent.setup();
  renderWith(<BtcView scanWorkerFactory={inlineBtcScanWorker} />, makeServices({ fetchFn: chain.fetchFn }));
  await user.selectOptions(screen.getByLabelText('Network'), 'regtest');
  await user.type(screen.getByLabelText(/Esplora server URL/), 'https://esplora.test/api');
  await user.type(screen.getByLabelText(/Or import a seed/), SEED_A);
  await user.click(screen.getByRole('button', { name: 'Import seed' }));
  await user.type(screen.getByLabelText(/First block height/), '1');
  return { chain, user };
}

describe('Bitcoin optional provider consent belongs to the installed wallet session', () => {
  it.each([
    ['the same wallet', SEED_A],
    ['another wallet', SEED_B],
  ])('requires new consent after locking and importing %s', async (_name, seed) => {
    const { chain, user } = await ready();
    await user.click(providerBox());
    expect(providerBox().checked).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Lock and forget keys' }));
    expect(screen.queryByRole('checkbox', { name: /Also ask the server/ })).toBeNull();
    await user.type(screen.getByLabelText(/Or import a seed/), seed);
    await user.click(screen.getByRole('button', { name: 'Import seed' }));
    expect(providerBox().checked).toBe(false);
    expect(providerBox().disabled).toBe(false);
    expect(chain.requests).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await screen.findByText(/Spent status: checked locally/);
    expect(chain.requests.some((path) => path.includes('/outspend/'))).toBe(false);
  });

  it('clears optional consent after the application locks and the wallet is restored', async () => {
    const { chain, user } = await ready();
    await user.click(providerBox());
    act(() => { notifyAppLock('idle'); });
    await user.type(screen.getByLabelText(/Or import a seed/), SEED_A);
    await user.click(screen.getByRole('button', { name: 'Import seed' }));
    expect(providerBox().checked).toBe(false);
    expect(chain.requests).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await screen.findByText(/1 unspent payment/);
    expect(chain.requests.some((path) => path.includes('/outspend/'))).toBe(false);
  });

  it('keeps disclosed light-mode checks required while optional consent stays cleared', async () => {
    const { chain, user } = await ready();
    await user.click(providerBox());
    await user.selectOptions(screen.getByLabelText('Additional scan source'), 'http');
    await user.click(screen.getByLabelText('Use light oracle scans with transaction inclusion proofs'));
    expect(providerBox().checked).toBe(true);
    expect(providerBox().disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Lock and forget keys' }));
    await user.type(screen.getByLabelText(/Or import a seed/), SEED_A);
    await user.click(screen.getByRole('button', { name: 'Import seed' }));
    expect(providerBox().checked).toBe(true);
    expect(providerBox().disabled).toBe(true);
    await user.selectOptions(screen.getByLabelText('Additional scan source'), 'none');
    expect(providerBox().checked).toBe(false);
    expect(providerBox().disabled).toBe(false);
    expect(chain.requests).toEqual([]);
  });
});
