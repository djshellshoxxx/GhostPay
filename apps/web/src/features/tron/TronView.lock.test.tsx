// @vitest-environment jsdom
import type { StealthKeySet } from '@ghostpay/core-crypto';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notifyAppLock } from '../../lib/appLock';
import { makeServices, renderWith } from '../../test/render';
import { BACKUP_A, mockTron, walletA } from './fixtures.testutil';
import { TronView } from './TronView';

const observed = vi.hoisted(() => ({ keys: [] as StealthKeySet[] }));

// Observe the real wallet secrets the view holds. Key generation is not replaced.
vi.mock('@ghostpay/core-crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ghostpay/core-crypto')>();
  return {
    ...actual,
    generateKeySet(...args: Parameters<typeof actual.generateKeySet>) {
      const keys = actual.generateKeySet(...args);
      observed.keys.push(keys);
      return keys;
    },
  };
});

const wiped = (b: Uint8Array | undefined): boolean => b !== undefined && b.every((x) => x === 0);

/** Renders the view on the local mock with the keys imported; returns the view's own key object. */
async function ready() {
  const chain = mockTron(walletA());
  const user = userEvent.setup();
  renderWith(<TronView />, makeServices({ fetchFn: chain.fetchFn }));
  await user.selectOptions(screen.getByLabelText('Network'), 'local');
  await user.type(screen.getByLabelText(/Node URL/), 'http://127.0.0.1:9090');
  const before = observed.keys.length;
  await user.type(screen.getByLabelText(/Or import keys/), BACKUP_A);
  await user.click(screen.getByRole('button', { name: 'Import keys' }));
  expect(observed.keys.length).toBe(before + 1);
  return { user, keys: observed.keys[before]! };
}

describe('TronView and the app lock', () => {
  beforeEach(() => {
    observed.keys.length = 0;
  });
  afterEach(() => {
    for (const k of observed.keys) {
      k.spendingSecret.fill(0);
      k.viewingSecret.fill(0);
    }
  });

  it('the app lock (idle timeout) wipes like Lock, clears typed keys and says why', async () => {
    const { user, keys } = await ready();
    await user.type(screen.getByLabelText(/First block/), '0');
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await screen.findByText(/1 funded payment/);
    expect(wiped(keys.spendingSecret) || wiped(keys.viewingSecret)).toBe(false);

    act(() => { notifyAppLock('idle'); });
    expect(wiped(keys.spendingSecret) && wiped(keys.viewingSecret)).toBe(true);
    expect(screen.queryByText(/funded payment/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Create new test wallet' })).toBeTruthy();
    expect(screen.getByText(/The app locked, so this wallet's keys were wiped from memory/)).toBeTruthy();

    await user.type(screen.getByLabelText(/Or import keys/), BACKUP_A);
    act(() => { notifyAppLock('idle'); });
    expect(screen.getByLabelText<HTMLInputElement>(/Or import keys/).value).toBe('');
    await user.type(screen.getByLabelText(/Or import keys/), BACKUP_A);
    await user.click(screen.getByRole('button', { name: 'Import keys' }));
    expect(screen.queryByText(/The app locked/)).toBeNull();
  });
});
