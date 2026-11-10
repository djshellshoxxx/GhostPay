// @vitest-environment jsdom
import { SilentPaymentError, type SilentPaymentKeys } from '@ghostpay/btc-silent-payments';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notifyAppLock } from '../../lib/appLock';
import { makeServices, renderWith } from '../../test/render';
import { BtcView } from './BtcView';
import { mockChain, SEED_A, walletA } from './fixtures.testutil';
import type { ScanParams, ScanResult } from './scan';

const observed = vi.hoisted(() => ({ keys: [] as SilentPaymentKeys[], tweaks: [] as Uint8Array[], seeds: [] as Uint8Array[] }));
/** The seed "Create new test wallet" gets, so the bytes the view keeps for its backup can be observed. */
const CREATED_SEED = vi.hoisted(() => 'c3'.repeat(32));

vi.mock('./wallet', async (importOriginal) => ({ ...(await importOriginal<typeof import('./wallet')>()), randomSeedHex: () => CREATED_SEED }));

vi.mock('@noble/hashes/utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@noble/hashes/utils.js')>();
  return {
    ...actual,
    hexToBytes(hex: string) {
      const bytes = actual.hexToBytes(hex);
      if (hex === CREATED_SEED) observed.seeds.push(bytes);
      return bytes;
    },
  };
});

// Observe the real wallet secrets and spend tweaks the view holds. Derivation and scanning are not replaced.
vi.mock('@ghostpay/btc-silent-payments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ghostpay/btc-silent-payments')>();
  return {
    ...actual,
    silentPaymentKeysFromSeed(...args: Parameters<typeof actual.silentPaymentKeysFromSeed>) {
      const keys = actual.silentPaymentKeysFromSeed(...args);
      observed.keys.push(keys);
      return keys;
    },
    async *scanBlocks(...args: Parameters<typeof actual.scanBlocks>) {
      for await (const r of actual.scanBlocks(...args)) {
        observed.tweaks.push(r.spendTweak);
        yield r;
      }
    },
  };
});

/** Lets a test wrap the view's scanForPayments; the real one is passed in. */
const scanHook = vi.hoisted(() => ({
  wrap: undefined as ((p: ScanParams, real: (p: ScanParams) => Promise<ScanResult>) => Promise<ScanResult>) | undefined,
}));

vi.mock('./scan', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./scan')>();
  return {
    ...actual,
    scanForPayments: (p: ScanParams) => (scanHook.wrap === undefined ? actual.scanForPayments(p) : scanHook.wrap(p, actual.scanForPayments)),
  };
});

const wiped = (b: Uint8Array | undefined): boolean => b !== undefined && b.every((x) => x === 0);
type User = ReturnType<typeof userEvent.setup>;

/** Renders the view on the regtest mock with the seed imported; returns the wallet's own key object. */
async function ready(fetchFn = mockChain('regtest', walletA()).fetchFn) {
  const user = userEvent.setup();
  const view = renderWith(<BtcView />, makeServices({ fetchFn }));
  await user.selectOptions(screen.getByLabelText('Network'), 'regtest');
  await user.type(screen.getByLabelText(/Esplora server URL/), 'https://esplora.test/api');
  const before = observed.keys.length;
  await user.type(screen.getByLabelText(/Or import a seed/), SEED_A);
  await user.click(screen.getByRole('button', { name: 'Import seed' }));
  expect(observed.keys.length).toBe(before + 1);
  return { user, view, keys: observed.keys[before]! };
}

async function scan(user: User) {
  await user.click(screen.getByRole('button', { name: 'Scan' }));
  await screen.findByText(/1 unspent payment/);
}

describe('BtcView key and spend-tweak lifetime', () => {
  beforeEach(() => {
    observed.keys.length = 0;
    observed.tweaks.length = 0;
    observed.seeds.length = 0;
  });
  afterEach(() => {
    scanHook.wrap = undefined;
    for (const k of observed.keys) {
      k.scanSecret.fill(0);
      k.spendSecret.fill(0);
    }
    for (const t of [...observed.tweaks, ...observed.seeds]) t.fill(0);
  });

  it('keeps the seed of a created wallet only as bytes for its backup; Lock and leaving the view wipe them', async () => {
    const user = userEvent.setup();
    const view = renderWith(<BtcView />, makeServices());
    await user.click(screen.getByRole('button', { name: 'Create new test wallet' }));
    expect(observed.seeds).toHaveLength(1);
    expect(screen.queryByText(CREATED_SEED)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Show backup seed' }));
    expect(screen.getByText(CREATED_SEED)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Lock and forget keys' }));
    expect(wiped(observed.seeds[0])).toBe(true);
    expect(screen.queryByText(CREATED_SEED)).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Create new test wallet' }));
    expect(observed.seeds).toHaveLength(2);
    expect(wiped(observed.seeds[1])).toBe(false);
    view.unmount();
    expect(wiped(observed.seeds[1])).toBe(true);
  });

  it('Lock wipes the scan and spend secrets and the spend tweaks of the scan results', async () => {
    const { user, keys } = await ready();
    await user.type(screen.getByLabelText(/First block height/), '0');
    await scan(user);
    expect(observed.tweaks).toHaveLength(1);
    expect(wiped(keys.scanSecret) || wiped(keys.spendSecret) || wiped(observed.tweaks[0])).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Lock and forget keys' }));
    expect(wiped(keys.scanSecret)).toBe(true);
    expect(wiped(keys.spendSecret)).toBe(true);
    expect(observed.tweaks.every(wiped)).toBe(true);
  });

  it('a new scan wipes the previous results, and leaving the view wipes everything', async () => {
    const { user, view, keys } = await ready();
    await user.type(screen.getByLabelText(/First block height/), '0');
    await scan(user);
    await scan(user);
    expect(observed.tweaks).toHaveLength(2);
    expect(wiped(observed.tweaks[0])).toBe(true);
    expect(wiped(observed.tweaks[1])).toBe(false);
    view.unmount();
    expect(wiped(observed.tweaks[1])).toBe(true);
    expect(wiped(keys.scanSecret) && wiped(keys.spendSecret)).toBe(true);
  });

  it('Lock cancels a running scan: it ends as cancelled, wipes the spend tweaks it produced and shows nothing', async () => {
    const chain = mockChain('regtest', walletA());
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => { release = r; });
    let held = false;
    let ended: string | undefined;
    scanHook.wrap = (p, real) => {
      const r = real(p);
      r.then(() => { ended = 'resolved'; }, (e: unknown) => { ended = e instanceof SilentPaymentError ? e.code : 'other'; });
      return r;
    };
    const { user } = await ready(async (url, init) => {
      if (url.includes('/outspend/')) {
        held = true;
        await gate;
      }
      return chain.fetchFn(url, init);
    });
    await user.type(screen.getByLabelText(/First block height/), '0');
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await waitFor(() => { expect(held).toBe(true); });
    expect(observed.tweaks).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Lock and forget keys' }));
    release();
    await waitFor(() => { expect(ended).toBe('ABORTED'); });
    expect(observed.tweaks.every(wiped)).toBe(true);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/unspent payment/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Create new test wallet' })).toBeTruthy();
  });

  it('drops and wipes a scan result that arrives after Lock (a scan that does not stop when cancelled)', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => { release = r; });
    let held = false;
    // Scans to the end without the cancel signal, then hands the result over only once released.
    scanHook.wrap = async (p, real) => {
      const res = await real({ client: p.client, wallet: p.wallet, fromHeight: p.fromHeight });
      held = true;
      await gate;
      return res;
    };
    const { user } = await ready();
    await user.type(screen.getByLabelText(/First block height/), '0');
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await waitFor(() => { expect(held).toBe(true); });
    expect(observed.tweaks).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Lock and forget keys' }));
    // Lock cannot reach a result the view has not received yet.
    expect(wiped(observed.tweaks[0])).toBe(false);
    release();
    await waitFor(() => { expect(wiped(observed.tweaks[0])).toBe(true); });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/unspent payment/)).toBeNull();
    expect(screen.queryByText(/Scanned blocks/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Create new test wallet' })).toBeTruthy();
  });

  it('the app lock (idle timeout) wipes like Lock, clears a typed seed and says why', async () => {
    const { user, keys } = await ready();
    await user.type(screen.getByLabelText(/First block height/), '0');
    await scan(user);
    act(() => { notifyAppLock('idle'); });
    expect(wiped(keys.scanSecret) && wiped(keys.spendSecret)).toBe(true);
    expect(observed.tweaks).toHaveLength(1);
    expect(observed.tweaks.every(wiped)).toBe(true);
    expect(screen.queryByText(/unspent payment/)).toBeNull();
    expect(screen.getByText(/The app locked, so this wallet's keys were wiped from memory/)).toBeTruthy();

    await user.type(screen.getByLabelText(/Or import a seed/), SEED_A);
    act(() => { notifyAppLock('idle'); });
    expect(screen.getByLabelText<HTMLInputElement>(/Or import a seed/).value).toBe('');
    await user.type(screen.getByLabelText(/Or import a seed/), SEED_A);
    await user.click(screen.getByRole('button', { name: 'Import seed' }));
    expect(screen.queryByText(/The app locked/)).toBeNull();
  });
});
