// @vitest-environment jsdom
import { parseFragment } from '@ghostpay/invoice-schema';
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { AppLean } from './AppLean';
import { AppShell, CORE_ORDER } from './AppShell';
import { subscribeAppLock } from './lib/appLock';
import { MemoryKeyVaultStore, setKeyVaultStoreForTests } from './lib/keyVault';
import * as keyVault from './lib/keyVault';
import { captureSessionBackupGuard, captureSessionGuard, clearSession, exportKeystore, generateSession, getSessionBackup, getSessionPublic, hasSession, importSession, verifyDownloadedBackup, withSessionSecrets, withSessionSecretsAsync } from './lib/session';
import { SETTINGS_KEY } from './lib/settings';
import { useApp, type AppState } from './state';
import { makeServices, renderWith, setHash } from './test/render';

// Count invocations without retaining the signing key or changing the signature.
const signerCalled = vi.hoisted(() => vi.fn<() => void>());
vi.mock('@ghostpay/invoice-schema', async (original) => {
  const schema = await original<typeof import('@ghostpay/invoice-schema')>();
  return {
    ...schema,
    signInvoice: (...args: Parameters<typeof schema.signInvoice>) => {
      signerCalled();
      return schema.signInvoice(...args);
    },
  };
});

let wall: number;
let monotonic: number;
let unsubscribe: (() => void) | undefined;
let observedApp: AppState | undefined;

beforeEach(() => {
  clearSession();
  localStorage.clear();
  setHash('');
  setKeyVaultStoreForTests(new MemoryKeyVaultStore());
  wall = 1_000_000;
  monotonic = 1000;
  observedApp = undefined;
  vi.useFakeTimers();
  vi.spyOn(Date, 'now').mockImplementation(() => wall);
  vi.spyOn(performance, 'now').mockImplementation(() => monotonic);
});

afterEach(() => {
  cleanup();
  unsubscribe?.();
  unsubscribe = undefined;
  vi.restoreAllMocks();
  vi.useRealTimers();
  setKeyVaultStoreForTests(undefined);
});

function ObserveSettings(): null {
  observedApp = useApp();
  return null;
}

function armed(recoverable = true, profile: 'full' | 'lean' = 'lean', observeSettings = false, lockTimeoutMin = 1) {
  if (recoverable) importSession({ spendingKeyHex: '11'.repeat(32), viewingKeyHex: '22'.repeat(32), signingKeyHex: '33'.repeat(32) });
  else generateSession();
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ lockTimeoutMin }));
  const reasons: string[] = [];
  unsubscribe = subscribeAppLock((reason) => { reasons.push(reason); });
  const services = makeServices();
  const rendered = renderWith(observeSettings
    ? <AppShell order={CORE_ORDER} profile={profile} mainPrelude={<ObserveSettings />} />
    : profile === 'full' ? <App /> : <AppLean />, services);
  return { reasons, services, rendered };
}

async function resume(event: 'pageshow' | 'focus' | 'pointerdown' | 'keydown' | 'visibilitychange' | 'resume' | 'freeze'): Promise<void> {
  await act(async () => {
    if (event === 'visibilitychange' || event === 'resume' || event === 'freeze') document.dispatchEvent(new Event(event));
    else fireEvent(window, new Event(event));
    await Promise.resolve();
  });
}

describe('GP-PAGES-04: idle deadlines across independent clock changes', () => {
  it.each(['pageshow', 'focus', 'visibilitychange', 'pointerdown', 'keydown'] as const)(
    'locks before %s can resume activity after wall-clock rollback with suspended timers',
    async (event) => {
      const { reasons } = armed();
      wall -= 60_000;
      // Some platforms pause the monotonic clock during sleep too. Clock rollback itself must fail closed.
      await resume(event);
      expect(reasons).toEqual(['idle']);
      expect(hasSession()).toBe(false);
    },
  );

  it('locks on monotonic expiry even when wall time stays after its initial value but below the deadline', async () => {
    const { reasons } = armed();
    wall += 30_000;
    monotonic += 60_000;
    await resume('pageshow');
    expect(reasons).toEqual(['idle']);
    expect(hasSession()).toBe(false);
  });

  it('detects rollback since the last lifecycle check, even above the last activity timestamp', async () => {
    const { reasons } = armed();
    wall += 30_000;
    monotonic += 30_000;
    await resume('focus');
    expect(reasons).toEqual([]);
    wall -= 1000;
    await resume('pageshow');
    expect(reasons).toEqual(['idle']);
    expect(hasSession()).toBe(false);
  });

  it('uses wall time when both ordinary timers and the monotonic clock pause during sleep', async () => {
    const { reasons } = armed();
    wall += 60_000;
    await resume('visibilitychange');
    await resume('focus');
    await resume('pageshow');
    expect(reasons).toEqual(['idle']);
    expect(hasSession()).toBe(false);
  });

  it('resets both clocks only for activity before expiry', async () => {
    const { reasons } = armed();
    wall += 45_000;
    monotonic += 45_000;
    await resume('pointerdown');
    wall += 45_000;
    monotonic += 45_000;
    await resume('focus');
    expect(reasons).toEqual([]);
    expect(hasSession()).toBe(true);
    monotonic += 15_000;
    await resume('pageshow');
    expect(reasons).toEqual(['idle']);
    expect(hasSession()).toBe(false);
  });

  it('keeps an unbacked-up key copy while still signalling the lock on clock rollback', async () => {
    const { reasons } = armed(false);
    wall -= 1000;
    await resume('focus');
    expect(reasons).toEqual(['idle']);
    expect(hasSession()).toBe(true);
  });
});

/** Retain a callback as if it had already entered the event queue before clearTimeout removed its timer. */
function queuedMinuteTimer(calls: readonly (readonly unknown[])[]): () => void {
  const callback = calls.find(([, delay]) => delay === 60_000)?.[0];
  if (typeof callback !== 'function') throw new Error('The one-minute idle timer was not registered.');
  return callback as () => void;
}

describe.each(['full', 'lean'] as const)('GP-PAGES-04: %s session generation and lifecycle boundaries', (profile) => {
  it.each(['wall', 'monotonic'] as const)('rejects backwards %s observations', async (clock) => {
    const { reasons } = armed(true, profile);
    if (clock === 'wall') wall -= 1;
    else monotonic -= 1;
    await resume('focus');
    expect(reasons).toEqual(['idle']);
    expect(hasSession()).toBe(false);
  });

  it.each([
    ['wall', Number.NaN], ['wall', Number.POSITIVE_INFINITY], ['wall', Number.NEGATIVE_INFINITY], ['wall', -1],
    ['monotonic', Number.NaN], ['monotonic', Number.POSITIVE_INFINITY], ['monotonic', Number.NEGATIVE_INFINITY], ['monotonic', -1],
  ] as const)('rejects an invalid initial %s observation (%s)', async (clock, value) => {
    if (clock === 'wall') wall = value;
    else monotonic = value;
    const { reasons } = armed(true, profile);
    await act(async () => { await Promise.resolve(); });
    expect(reasons).toEqual(['idle']);
    expect(hasSession()).toBe(false);
  });

  it.each(['wall', 'monotonic'] as const)('fails closed when reading the %s clock throws', async (clock) => {
    const { reasons } = armed(true, profile);
    // jsdom timestamps new Events with Date.now; construct the event before making only the application read throw.
    const focus = new Event('focus');
    const observe = clock === 'wall' ? vi.spyOn(Date, 'now') : vi.spyOn(performance, 'now');
    observe.mockImplementationOnce(() => { throw new Error('synthetic unavailable clock'); });
    await act(async () => { window.dispatchEvent(focus); await Promise.resolve(); });
    expect(reasons).toEqual(['idle']);
    expect(hasSession()).toBe(false);
  });

  it('observes the hidden transition so rollback while hidden is caught on restoration', async () => {
    const { reasons } = armed(true, profile);
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    wall += 30_000;
    monotonic += 30_000;
    await resume('visibilitychange');
    expect(reasons).toEqual([]);
    // Still after the last activity, but before the clock value observed while becoming hidden.
    wall -= 1000;
    visibility.mockReturnValue('visible');
    await resume('visibilitychange');
    await resume('pageshow');
    expect(reasons).toEqual(['idle']);
    expect(hasSession()).toBe(false);
  });

  it('retains suspended keys and reports unconfirmed custody when its promise rejects', async () => {
    vi.spyOn(keyVault, 'loadedKeysRecoverable').mockRejectedValue(new Error('synthetic storage payload must stay private'));
    const { reasons } = armed(true, profile);
    const metaAddress = getSessionPublic()?.metaAddress;
    wall += 61_000;
    await resume('focus');
    expect(reasons).toEqual(['idle']);
    expect(hasSession()).toBe(true);
    expect(getSessionPublic()?.metaAddress).toBe(metaAddress);
    expect(() => withSessionSecrets(() => undefined)).toThrow();
    expect(screen.getByText('Session locked after inactivity', { exact: true })).toBeTruthy();
    expect(document.querySelector('[role="status"][aria-live]')?.textContent).toContain('could not be confirmed');
    expect(document.body.textContent).not.toContain('synthetic storage payload');
  });

  it('never installs an unchecked second clock reading as an activity baseline', async () => {
    const { reasons } = armed(true, profile);
    // Legacy arm checked one sample, then installed a different, unchecked sample. The next finite clock
    // observation subtracted NaN and could not detect expiry while normal timers remained suspended.
    vi.spyOn(Date, 'now').mockImplementationOnce(() => wall).mockImplementationOnce(() => Number.NaN).mockImplementation(() => wall);
    await resume('pointerdown');
    wall += 61_000;
    await resume('focus');
    expect(reasons).toEqual(['idle']);
    expect(hasSession()).toBe(false);
  });

  it('keeps a new session on its own deadline after the previous session expired', async () => {
    const { reasons } = armed(true, profile);
    wall += 61_000;
    await resume('focus');
    expect(hasSession()).toBe(false);
    act(() => { importSession({ spendingKeyHex: '44'.repeat(32), viewingKeyHex: '55'.repeat(32), signingKeyHex: '66'.repeat(32) }); });
    wall += 30_000;
    monotonic += 30_000;
    await resume('pageshow');
    expect(hasSession()).toBe(true);
    wall += 30_000;
    monotonic += 30_000;
    await resume('focus');
    expect(hasSession()).toBe(false);
    expect(reasons).toEqual(['idle', 'idle']);
  });

  it('rejects a queued timeout from before valid activity reset the deadline', async () => {
    const timers = vi.spyOn(globalThis, 'setTimeout');
    const { reasons } = armed(true, profile);
    const queued = queuedMinuteTimer(timers.mock.calls);
    wall += 45_000;
    monotonic += 45_000;
    await resume('pointerdown');
    await act(async () => { queued(); await Promise.resolve(); });
    expect(reasons).toEqual([]);
    expect(hasSession()).toBe(true);
    wall += 60_000;
    monotonic += 60_000;
    await resume('focus');
    expect(reasons).toEqual(['idle']);
  });

  it('rejects a queued timeout from the wallet that was replaced', async () => {
    const timers = vi.spyOn(globalThis, 'setTimeout');
    const { reasons } = armed(true, profile);
    const queued = queuedMinuteTimer(timers.mock.calls);
    wall += 59_000;
    monotonic += 59_000;
    let replacement: ReturnType<typeof generateSession> | undefined;
    act(() => { replacement = importSession({ spendingKeyHex: '44'.repeat(32), viewingKeyHex: '55'.repeat(32), signingKeyHex: '66'.repeat(32) }); });
    await act(async () => { queued(); await Promise.resolve(); });
    expect(reasons).toEqual([]);
    expect(getSessionPublic()?.metaAddress).toBe(replacement?.metaAddress);
    wall += 60_000;
    monotonic += 60_000;
    await resume('focus');
    expect(hasSession()).toBe(false);
    expect(reasons).toEqual(['idle']);
  });

  it('does not lock a replacement installed synchronously by an idle-lock listener', async () => {
    const { reasons } = armed(true, profile);
    let replacement: ReturnType<typeof generateSession> | undefined;
    const release = subscribeAppLock(() => {
      release();
      replacement = importSession({ spendingKeyHex: '44'.repeat(32), viewingKeyHex: '55'.repeat(32), signingKeyHex: '66'.repeat(32) });
    });
    try {
      wall += 61_000;
      await resume('focus');
      expect(reasons).toEqual(['idle']);
      expect(hasSession()).toBe(true);
      expect(getSessionPublic()?.metaAddress).toBe(replacement?.metaAddress);
      expect(withSessionSecrets(() => true)).toBe(true);
    } finally {
      release();
    }
  });

  it('does not let a queued timer from an unmounted shell lock a live session', async () => {
    const timers = vi.spyOn(globalThis, 'setTimeout');
    const { reasons, rendered } = armed(true, profile);
    const queued = queuedMinuteTimer(timers.mock.calls);
    rendered.unmount();
    await act(async () => { queued(); await Promise.resolve(); });
    expect(reasons).toEqual([]);
    expect(hasSession()).toBe(true);
  });

  it('does not apply an old recoverability result after effect disposal', async () => {
    let complete: ((recoverable: boolean) => void) | undefined;
    vi.spyOn(keyVault, 'loadedKeysRecoverable').mockImplementation(() => new Promise<boolean>((resolve) => { complete = resolve; }));
    const { rendered } = armed(true, profile);
    wall += 61_000;
    await resume('focus');
    expect(complete).toBeDefined();
    rendered.unmount();
    await act(async () => { complete?.(true); await Promise.resolve(); });
    expect(hasSession()).toBe(true);
    // Expiry already suspended this session. Disposing the shell must neither resurrect it nor destroy a
    // potentially sole copy through a stale asynchronous custody decision.
    expect(() => withSessionSecrets(() => undefined)).toThrow();
  });

  it('does not grant a fresh activity lease when the configured timeout changes', async () => {
    const { reasons } = armed(true, profile, true);
    wall += 40_000;
    monotonic += 40_000;
    act(() => {
      if (observedApp === undefined) throw new Error('Missing shell state.');
      observedApp.updateSettings({ ...observedApp.settings, lockTimeoutMin: 2 });
    });
    wall += 80_000;
    monotonic += 80_000;
    await resume('pageshow');
    expect(reasons).toEqual(['idle']);
    expect(hasSession()).toBe(false);
  });

  it('locks before a resumed target handler can borrow private keys', async () => {
    const { reasons } = armed(true, profile);
    wall += 61_000;
    const target = document.createElement('button');
    document.body.append(target);
    let allowed: boolean | undefined;
    target.addEventListener('pointerdown', () => {
      try { withSessionSecrets(() => undefined); allowed = true; } catch { allowed = false; }
    });
    try {
      await act(async () => { fireEvent.pointerDown(target); await Promise.resolve(); });
      expect(allowed).toBe(false);
      expect(reasons).toEqual(['idle']);
      expect(hasSession()).toBe(false);
    } finally {
      target.remove();
    }
  });

  it('rejects an async secret-operation completion before resumed timers or lifecycle events run', async () => {
    const { reasons } = armed(true, profile);
    const guard = captureSessionGuard();
    let complete: (() => void) | undefined;
    const deferred = new Promise<void>((resolve) => { complete = resolve; });
    const operation = withSessionSecretsAsync(async () => {
      await deferred;
      guard();
      return true;
    });
    // Only the promise continuation resumes. Neither an activity/visibility event nor a queued timer has run.
    wall += 61_000;
    await act(async () => {
      complete?.();
      await expect(operation).rejects.toThrow();
    });
    expect(reasons).toEqual(['idle']);
    expect(() => withSessionSecrets(() => undefined)).toThrow();
  });

  it('renews recovery-input cleanup without restoring an expired sole-copy session authority', async () => {
    const { reasons } = armed(false, profile);
    const metaAddress = getSessionPublic()?.metaAddress;
    wall += 61_000;
    await resume('pointerdown');
    expect(hasSession()).toBe(true);
    expect(getSessionPublic()?.metaAddress).toBe(metaAddress);
    expect(() => withSessionSecrets(() => undefined)).toThrow();
    await resume('keydown');
    expect(() => withSessionSecrets(() => undefined)).toThrow();
    wall += 61_000;
    monotonic += 61_000;
    await resume('focus');
    expect(reasons).toEqual(['idle', 'idle']);
    expect(hasSession()).toBe(true);
    expect(getSessionPublic()?.metaAddress).toBe(metaAddress);
    expect(() => withSessionSecrets(() => undefined)).toThrow();
  });

  it('clears fresh recovery input and invalidates its guard after another idle period', async () => {
    const { reasons } = armed(false, profile);
    const metaAddress = getSessionPublic()?.metaAddress;
    wall += 61_000;
    await resume('focus');
    await resume('pointerdown');
    const repeatPassphrase = screen.getByLabelText<HTMLInputElement>('Repeat passphrase', { exact: true });
    fireEvent.change(repeatPassphrase, { target: { value: 'fresh recovery passphrase for this test' } });
    const recoveryGuard = captureSessionBackupGuard();
    expect(repeatPassphrase.value).toBe('fresh recovery passphrase for this test');
    wall += 61_000;
    monotonic += 61_000;
    await resume('focus');
    expect(repeatPassphrase.value).toBe('');
    expect(recoveryGuard).toThrow();
    expect(reasons).toEqual(['idle', 'idle']);
    expect(hasSession()).toBe(true);
    expect(getSessionPublic()?.metaAddress).toBe(metaAddress);
    expect(() => withSessionSecrets(() => undefined)).toThrow();
  });

  it('does not let housekeeping input cancel a pending recoverability disposal decision', async () => {
    let complete: ((recoverable: boolean) => void) | undefined;
    const deferred = new Promise<boolean>((resolve) => { complete = resolve; });
    vi.spyOn(keyVault, 'loadedKeysRecoverable').mockReturnValue(deferred);
    const { reasons } = armed(true, profile);
    wall += 61_000;
    await resume('focus');
    await resume('pointerdown');
    await act(async () => { complete?.(true); await Promise.resolve(); });
    expect(reasons).toEqual(['idle']);
    expect(hasSession()).toBe(false);
  });

  it.each(['resume', 'freeze'] as const)('checks the deadline on the document %s lifecycle event', async (event) => {
    const { reasons } = armed(true, profile);
    wall += 61_000;
    await resume(event);
    expect(reasons).toEqual(['idle']);
    expect(hasSession()).toBe(false);
  });
});

describe('GP-PAGES-04: first invoice signature after sleep', () => {
  async function readyToSign(): Promise<HTMLButtonElement> {
    armed(false);
    const passphrase = 'violet cedar orbit meadow lantern';
    await act(async () => {
      const backup = await exportKeystore(passphrase, { N: 1 << 14 });
      await verifyDownloadedBackup(backup, passphrase);
    });
    return fillInvoice();
  }

  function fillInvoice(): HTMLButtonElement {
    expect(getSessionBackup()?.verified).toBe(true);
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Create invoice' }));
    fireEvent.change(screen.getByLabelText('Token amount'), { target: { value: '0.5' } });
    fireEvent.change(screen.getByLabelText('Item 1 description'), { target: { value: 'Test item' } });
    fireEvent.change(screen.getByLabelText('Item 1 unit price'), { target: { value: '1.00' } });
    signerCalled.mockClear();
    return screen.getByRole<HTMLButtonElement>('button', { name: 'Create invoice link' });
  }

  async function activate(submit: HTMLButtonElement): Promise<void> {
    // A click-only activation can reach the form before a queued wake event or timer.
    await act(async () => {
      fireEvent.click(submit);
      await Promise.resolve();
    });
  }

  function expectLocked(): void {
    expect(signerCalled).not.toHaveBeenCalled();
    expect(hasSession()).toBe(false);
    expect(screen.getByText(/Seller keys were wiped from memory.*Load them again/)).toBeTruthy();
    expect(screen.queryByLabelText('Link')).toBeNull();
  }

  async function expectSigned(): Promise<void> {
    expect(signerCalled).toHaveBeenCalledOnce();
    expect(hasSession()).toBe(true);
    const link = screen.getByLabelText<HTMLTextAreaElement>('Link').value;
    expect((await parseFragment(new URL(link).hash)).verification.signatureValid).toBe(true);
  }

  it('requires the seller to unlock and never calls the signer past the deadline', async () => {
    const submit = await readyToSign();
    wall += 60_001;
    await activate(submit);
    expectLocked();
  });

  it('signs once one millisecond below the deadline', async () => {
    const submit = await readyToSign();
    wall += 59_999;
    await activate(submit);
    await expectSigned();
  });

});
