// @vitest-environment jsdom
import { act, cleanup, fireEvent, isInaccessible, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type ReactNode } from 'react';
import { SensitiveContent } from '../components/SensitiveContent';
import { PrivateHistory } from '../components/PrivateHistory';
import { notifyAppLock } from './appLock';
import { clearSession, generateSession, suspendSession } from './session';
import { PrivacyProvider, PRIVACY_REVEAL_MS, revokePrivacyReveal, usePrivacy } from './privacyMode';

function Controls(): ReactNode {
  const privacy = usePrivacy();
  return <>
    <button data-privacy-safe-control onClick={privacy.hide}>Safe hide control</button>
    <button onClick={privacy.reveal}>Reveal fixture</button>
    <SensitiveContent><label>Private draft<input defaultValue="private invoice amount" /></label><p>Private address fixture</p></SensitiveContent>
    <PrivateHistory unlocked={true} scope="seller:chain"><p>Private history fixture</p></PrivateHistory>
  </>;
}
function fixture(scope: string = 'pay', enabled = true): ReactNode {
  return <PrivacyProvider enabled={enabled} scope={scope}><Controls /></PrivacyProvider>;
}
function reveal(): void { fireEvent.click(screen.getByRole('button', { name: 'Reveal fixture' })); }
function hidden(): boolean { return screen.queryByText('Private address fixture') === null; }

beforeEach(() => {
  clearSession();
  revokePrivacyReveal();
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  clearSession();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('temporary privacy reveals', () => {
  it('expires at 30 seconds, clears both text selections and moves focus without losing a mounted draft', () => {
    render(fixture());
    expect(hidden()).toBe(true);
    reveal();
    const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Private draft' });
    fireEvent.change(input, { target: { value: 'unsaved recovery draft' } });
    input.focus(); input.select();
    const range = document.createRange();
    range.selectNodeContents(screen.getByText('Private address fixture'));
    document.getSelection()?.addRange(range);
    act(() => { vi.advanceTimersByTime(PRIVACY_REVEAL_MS - 1); });
    expect(hidden()).toBe(false);
    act(() => { vi.advanceTimersByTime(1); });
    expect(hidden()).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Safe hide control' }));
    expect(document.getSelection()?.rangeCount).toBe(0);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(0);
    reveal();
    expect(screen.getByRole('textbox', { name: 'Private draft' })).toBe(input);
    expect(input.value).toBe('unsaved recovery draft');
  });

  it('revokes both global and history reveals when hidden, without reviving them on foreground', () => {
    let visibility: DocumentVisibilityState = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    render(fixture());
    reveal();
    fireEvent.click(screen.getByRole('button', { name: 'Reveal history for 30 seconds' }));
    expect(isInaccessible(screen.getByText('Private history fixture'))).toBe(false);
    act(() => { visibility = 'hidden'; document.dispatchEvent(new Event('visibilitychange')); });
    expect(hidden()).toBe(true);
    expect(screen.queryByText('Private history fixture')).toBeNull();
    reveal();
    expect(hidden()).toBe(true);
    act(() => { visibility = 'visible'; document.dispatchEvent(new Event('visibilitychange')); });
    expect(hidden()).toBe(true);
    reveal();
    expect(screen.queryByText('Private history fixture')).toBeNull();
  });

  it.each([
    ['pagehide', () => { window.dispatchEvent(new Event('pagehide')); }],
    ['global vault lock', () => { notifyAppLock('manual'); }],
    ['seller replacement', () => { generateSession(); }],
    ['seller clear', () => { clearSession(); }],
    ['backup-only suspension', () => { suspendSession(); }],
    ['account lifecycle hook', revokePrivacyReveal],
  ] as const)('revokes on %s', (_name, invalidate) => {
    generateSession();
    render(fixture()); reveal();
    expect(hidden()).toBe(false);
    act(invalidate);
    expect(hidden()).toBe(true);
  });

  it('requires new consent after a view or privacy-mode change', () => {
    const panel = render(fixture()); reveal();
    panel.rerender(fixture('scan'));
    expect(hidden()).toBe(true);
    reveal();
    panel.rerender(fixture('scan', false));
    expect(hidden()).toBe(false);
    panel.rerender(fixture('scan', true));
    expect(hidden()).toBe(true);
  });

  it.each(['wall forward', 'monotonic forward', 'wall rollback', 'monotonic rollback', 'invalid wall', 'invalid monotonic'] as const)('fails closed for %s without reviving an expired reveal', (scenario) => {
    let wall = 1_000_000;
    let monotonic = 10_000;
    vi.spyOn(Date, 'now').mockImplementation(() => wall);
    vi.spyOn(performance, 'now').mockImplementation(() => monotonic);
    render(fixture()); reveal();
    wall += 2_000; monotonic += 2_000;
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(hidden()).toBe(false);
    if (scenario === 'wall forward') wall += PRIVACY_REVEAL_MS;
    if (scenario === 'monotonic forward') monotonic += PRIVACY_REVEAL_MS;
    if (scenario === 'wall rollback') wall--;
    if (scenario === 'monotonic rollback') monotonic--;
    if (scenario === 'invalid wall') wall = Number.NaN;
    if (scenario === 'invalid monotonic') monotonic = Number.NaN;
    act(() => { window.dispatchEvent(new Event('focus')); });
    expect(hidden()).toBe(true);
    wall = 1_003_000; monotonic = 13_000;
    act(() => { window.dispatchEvent(new Event('focus')); });
    expect(hidden()).toBe(true);
  });

  it('refuses reveal if clocks cannot be observed', () => {
    vi.spyOn(performance, 'now').mockImplementation(() => { throw new Error('clock unavailable'); });
    render(fixture()); reveal();
    expect(hidden()).toBe(true);
  });

  it('requires current unlocked authority and new history consent after a lock', () => {
    function HistoryFixture(props: { readonly unlocked: boolean }): ReactNode {
      return <PrivacyProvider enabled scope="scan"><Controls /><PrivateHistory unlocked={props.unlocked} scope="another-chain"><p>Authority-bound history</p></PrivateHistory></PrivacyProvider>;
    }
    const panel = render(<HistoryFixture unlocked={false} />);
    reveal();
    const reveals = screen.getAllByRole<HTMLButtonElement>('button', { name: 'Reveal history for 30 seconds' });
    expect(reveals.at(-1)?.disabled).toBe(true);
    panel.rerender(<HistoryFixture unlocked />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Reveal history for 30 seconds' }).at(-1)!);
    expect(isInaccessible(screen.getByText('Authority-bound history'))).toBe(false);
    panel.rerender(<HistoryFixture unlocked={false} />);
    expect(screen.queryByText('Authority-bound history')).toBeNull();
    panel.rerender(<HistoryFixture unlocked />);
    expect(screen.queryByText('Authority-bound history')).toBeNull();
  });
});
