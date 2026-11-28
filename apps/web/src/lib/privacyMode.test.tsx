// @vitest-environment jsdom
import fc from 'fast-check';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notifyAppLock } from './appLock';
import { clearSession, generateSession } from './session';
import {
  PRIVACY_MODE_KEY, PRIVACY_REVEAL_MS, PrivacyProvider, readPrivacyMode, resetPrivacyModeForTests, revealCurrent,
  revokePrivacyReveal, savePrivacyMode, usePrivacy, type RevealGrant,
} from './privacyMode';

function Probe(): React.ReactNode {
  const { masked, reveal } = usePrivacy();
  return <><output>{masked ? 'masked' : 'shown'}</output><button type="button" onClick={reveal}>reveal</button></>;
}
const shown = (): string => screen.getByText(/^(masked|shown)$/).textContent ?? '';

beforeEach(() => { localStorage.clear(); resetPrivacyModeForTests(); clearSession(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); resetPrivacyModeForTests(); clearSession(); });

describe('privacy mode preference', () => {
  it('is off when absent and follows a saved choice', () => {
    expect(readPrivacyMode()).toBe(false);
    expect(savePrivacyMode(true)).toBe(true);
    expect(localStorage.getItem(PRIVACY_MODE_KEY)).toBe('1');
    expect(readPrivacyMode()).toBe(true);
    expect(savePrivacyMode(false)).toBe(true);
    expect(readPrivacyMode()).toBe(false);
  });
  it.each(['true', 'yes', '2', '', ' 0', '{}'])('fails closed to masked for an unrecognised saved value %j', (raw) => {
    localStorage.setItem(PRIVACY_MODE_KEY, raw);
    expect(readPrivacyMode()).toBe(true);
  });
  it('fails closed to masked when the saved preference cannot be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    expect(readPrivacyMode()).toBe(true);
  });
  it('applies in this tab and reports when the browser could not save the choice', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(savePrivacyMode(true)).toBe(false);
    expect(readPrivacyMode()).toBe(true);
    expect(savePrivacyMode(false)).toBe(false);
    expect(readPrivacyMode()).toBe(false);
  });
});

describe('temporary reveal', () => {
  it('is masked when enabled, reveals deliberately and expires after 30 seconds', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'Date', 'performance'] });
    render(<PrivacyProvider enabled scope="a"><Probe /></PrivacyProvider>);
    expect(shown()).toBe('masked');
    act(() => { screen.getByRole('button', { name: 'reveal' }).click(); });
    expect(shown()).toBe('shown');
    act(() => { vi.advanceTimersByTime(PRIVACY_REVEAL_MS - 1_000); });
    expect(shown()).toBe('shown');
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(shown()).toBe('masked');
  });
  it('is never masked while privacy mode is off', () => {
    render(<PrivacyProvider enabled={false} scope="a"><Probe /></PrivacyProvider>);
    expect(shown()).toBe('shown');
  });
  it.each([
    ['app lock', () => { notifyAppLock('manual'); }],
    ['idle lock', () => { notifyAppLock('idle'); }],
    ['session change', () => { generateSession(); }],
    ['explicit hide', revokePrivacyReveal],
    ['page exit', () => { window.dispatchEvent(new Event('pagehide')); }],
  ] as const)('revokes a reveal on %s', (_name, revoke) => {
    render(<PrivacyProvider enabled scope="a"><Probe /></PrivacyProvider>);
    act(() => { screen.getByRole('button', { name: 'reveal' }).click(); });
    expect(shown()).toBe('shown');
    act(revoke);
    expect(shown()).toBe('masked');
  });
  it('revokes a reveal when the scope changes (navigation or a new invoice) and when the tab is hidden', () => {
    const view = render(<PrivacyProvider enabled scope="pay"><Probe /></PrivacyProvider>);
    act(() => { screen.getByRole('button', { name: 'reveal' }).click(); });
    view.rerender(<PrivacyProvider enabled scope="scan"><Probe /></PrivacyProvider>);
    expect(shown()).toBe('masked');
    act(() => { screen.getByRole('button', { name: 'reveal' }).click(); });
    expect(shown()).toBe('shown');
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    visibility.mockReturnValue('visible');
    expect(shown()).toBe('masked');
  });
  it('refuses to start a reveal on a hidden page', () => {
    render(<PrivacyProvider enabled scope="a"><Probe /></PrivacyProvider>);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => { screen.getByRole('button', { name: 'reveal' }).click(); });
    expect(shown()).toBe('masked');
  });
});

describe('reveal deadline model (fuzz)', () => {
  // Fixed seed: failures are reproducible in CI.
  const RUNS = { seed: 0x4d41534b, numRuns: 2000 } as const;
  const stepArb = fc.record({ wall: fc.integer({ min: -5_000, max: 20_000 }), mono: fc.integer({ min: -5_000, max: 20_000 }) });
  it('never shows after either clock reaches 30 s or moves backwards, and expiry is sticky', () => {
    fc.assert(fc.property(fc.array(stepArb, { minLength: 1, maxLength: 12 }), fc.integer({ min: 0, max: 1e9 }), (steps, origin) => {
      const start = { wall: origin, monotonic: origin / 2 };
      const grant: RevealGrant = { scope: 's', revision: 0, started: start, observed: start, expired: false };
      let wall = start.wall; let mono = start.monotonic;
      let everFailed = false;
      for (const step of steps) {
        const prevWall = wall; const prevMono = mono;
        wall += step.wall; mono += step.mono;
        const now = { wall, monotonic: mono };
        const shownNow = revealCurrent(grant, 's', true, 0, now, true);
        const rolledBack = wall < prevWall || mono < prevMono;
        const late = wall - start.wall >= PRIVACY_REVEAL_MS || mono - start.monotonic >= PRIVACY_REVEAL_MS;
        if (rolledBack || late || everFailed || wall < 0 || mono < 0) expect(shownNow).toBe(false);
        if (!shownNow) everFailed = true;
        expect(grant.expired).toBe(everFailed);
      }
    }), RUNS);
  });
  it('never shows for another scope, a newer revision, a disallowed mode, a hidden page or an unreadable clock', () => {
    fc.assert(fc.property(fc.constantFrom('scope', 'revision', 'allowed', 'hidden', 'clock'), (cause) => {
      const start = { wall: 1_000, monotonic: 1_000 };
      const grant: RevealGrant = { scope: 's', revision: 3, started: start, observed: start, expired: false };
      const now = cause === 'clock' ? undefined : { wall: 1_001, monotonic: 1_001 };
      const result = revealCurrent(grant, cause === 'scope' ? 't' : 's', cause !== 'allowed', cause === 'revision' ? 4 : 3, now, cause !== 'hidden');
      expect(result).toBe(false);
      expect(revealCurrent(grant, 's', true, 3, { wall: 1_002, monotonic: 1_002 }, true)).toBe(false);
    }), { ...RUNS, numRuns: 50 });
  });
});
