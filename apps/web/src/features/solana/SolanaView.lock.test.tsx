// @vitest-environment jsdom
import type { StealthKeys } from '@ghostpay/solana-stealth';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notifyAppLock } from '../../lib/appLock';
import { makeServices, renderWith } from '../../test/render';
import { SEED_A, mockChain, walletA } from './fixtures.testutil';
import { SolanaView } from './SolanaView';

const observed = vi.hoisted(() => ({ keys: [] as StealthKeys[], tweaks: [] as Uint8Array[] }));

// Observe the real wallet secrets and scan tweaks the view holds. Derivation and scanning are not replaced.
vi.mock('@ghostpay/solana-stealth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ghostpay/solana-stealth')>();
  return {
    ...actual,
    deriveStealthKeysFromSeed(...args: Parameters<typeof actual.deriveStealthKeysFromSeed>) {
      const keys = actual.deriveStealthKeysFromSeed(...args);
      observed.keys.push(keys);
      return keys;
    },
    async *scanAnnouncements(...args: Parameters<typeof actual.scanAnnouncements>) {
      for await (const payment of actual.scanAnnouncements(...args)) {
        observed.tweaks.push(payment.tweak);
        yield payment;
      }
    },
  };
});

const wiped = (b: Uint8Array | undefined): boolean => b !== undefined && b.every((x) => x === 0);

/** Renders the view on the local mock with the seed imported; returns the view's own key object. */
async function ready() {
  const chain = mockChain('localnet', walletA());
  const user = userEvent.setup();
  renderWith(<SolanaView />, makeServices({ fetchFn: chain.fetchFn }));
  await user.selectOptions(screen.getByLabelText('Network'), 'localnet');
  await user.type(screen.getByLabelText(/RPC server URL/), 'http://127.0.0.1:8899');
  const before = observed.keys.length;
  await user.type(screen.getByLabelText(/Or import a seed/), SEED_A);
  await user.click(screen.getByRole('button', { name: 'Import seed' }));
  expect(observed.keys.length).toBe(before + 1);
  return { user, keys: observed.keys[before]! };
}

describe('SolanaView and the app lock', () => {
  beforeEach(() => {
    observed.keys.length = 0;
    observed.tweaks.length = 0;
  });
  afterEach(() => {
    for (const k of observed.keys) {
      k.spendSecret.fill(0);
      k.viewSecret.fill(0);
    }
    for (const t of observed.tweaks) t.fill(0);
  });

  it('the app lock (idle timeout) wipes like Lock, clears a typed seed and says why', async () => {
    const { user, keys } = await ready();
    await user.type(screen.getByLabelText(/First slot/), '0');
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await screen.findByText(/1 funded payment/);
    expect(observed.tweaks).toHaveLength(1);
    expect(wiped(keys.spendSecret) || wiped(keys.viewSecret) || wiped(observed.tweaks[0])).toBe(false);

    act(() => { notifyAppLock('idle'); });
    expect(wiped(keys.spendSecret) && wiped(keys.viewSecret)).toBe(true);
    expect(wiped(observed.tweaks[0])).toBe(true);
    expect(screen.queryByText(/funded payment/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Create new test wallet' })).toBeTruthy();
    expect(screen.getByText(/The app locked, so this wallet's keys were wiped from memory/)).toBeTruthy();

    await user.type(screen.getByLabelText(/Or import a seed/), SEED_A);
    act(() => { notifyAppLock('idle'); });
    expect(screen.getByLabelText<HTMLInputElement>(/Or import a seed/).value).toBe('');
    await user.type(screen.getByLabelText(/Or import a seed/), SEED_A);
    await user.click(screen.getByRole('button', { name: 'Import seed' }));
    expect(screen.queryByText(/The app locked/)).toBeNull();
  });
});
