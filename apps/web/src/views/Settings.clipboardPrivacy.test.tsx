// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppShell } from '../AppShell';
import { CopyButton } from '../components/Common';
import { DEFAULT_SETTINGS, SETTINGS_KEY, UI_PRIVACY_KEY } from '../lib/settings';
import { makeServices, renderWith } from '../test/render';

beforeEach(() => { window.localStorage.clear(); window.history.replaceState(null, '', '/'); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

function open() {
  // The real shell loads/persists preferences. Its shared copy uses those preferences without a per-site prop.
  const rendered = renderWith(<AppShell order={['home', 'settings']} mainPrelude={<CopyButton text="private payment details" label="Copy payment" />} />, makeServices());
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  return rendered;
}

it('makes cleanup optional, persists the chosen interval, and protects a shared copy after reload', async () => {
  vi.useFakeTimers();
  open();
  const select = screen.getByLabelText<HTMLSelectElement>('Clear copied data automatically');
  expect(select.value).toBe('0');
  fireEvent.change(select, { target: { value: '30000' } });
  expect(JSON.parse(window.localStorage.getItem(UI_PRIVACY_KEY) ?? '{}')).toMatchObject({ clipboardClearAfterMs: 30_000 });
  expect(screen.getByText(/another app can change the clipboard between the check and clear/)).toBeTruthy();
  cleanup();
  let value = '';
  const readText = vi.fn(() => Promise.resolve(value));
  const writeText = vi.fn((next: string) => { value = next; return Promise.resolve(); });
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText, writeText } });
  open();
  expect(screen.getByLabelText<HTMLSelectElement>('Clear copied data automatically').value).toBe('30000');
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy payment' })); await Promise.resolve(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(29_999); });
  expect(value).toBe('private payment details');
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(value).toBe('');
  expect(readText).toHaveBeenCalledTimes(2);
  expect(window.localStorage.getItem(SETTINGS_KEY) ?? '').not.toContain('private payment details');
  expect(window.localStorage.getItem(UI_PRIVACY_KEY)).not.toContain('private payment details');
});

it('turning cleanup off cancels a pending timer through the saved setting', async () => {
  vi.useFakeTimers();
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, clipboardClearAfterMs: 60_000 }));
  const port = { readText: vi.fn(() => Promise.resolve('private payment details')), writeText: vi.fn(() => Promise.resolve()) };
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: port });
  open();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy payment' })); await Promise.resolve(); });
  fireEvent.change(screen.getByLabelText('Clear copied data automatically'), { target: { value: '0' } });
  await act(async () => { await vi.advanceTimersByTimeAsync(300_000); });
  expect(port.readText).not.toHaveBeenCalled();
  expect(port.writeText).toHaveBeenCalledExactlyOnceWith('private payment details');
});

it('changing local privacy controls preserves unsaved sensitive form fields', () => {
  open();
  const rpc = screen.getByLabelText<HTMLInputElement>('Base Sepolia RPC URL');
  fireEvent.change(rpc, { target: { value: 'https://unsaved.example/' } });
  fireEvent.change(screen.getByLabelText('Clear copied data automatically'), { target: { value: '60000' } });
  expect(rpc.value).toBe('https://unsaved.example/');
  const privacy = screen.getAllByRole('switch', { name: 'Privacy mode' })[0];
  if (privacy === undefined) throw new Error('Privacy control missing');
  fireEvent.click(privacy);
  expect(rpc.value).toBe('https://unsaved.example/');
  expect(rpc.closest('[hidden]')).not.toBeNull();
  expect(screen.getByRole('combobox', { name: 'Clear copied data automatically' })).toBeTruthy();
  expect(window.localStorage.getItem(SETTINGS_KEY) ?? '').not.toContain('unsaved.example');
  expect(window.localStorage.getItem(UI_PRIVACY_KEY)).not.toContain('unsaved.example');
});

it('applies the choice for this tab and explains when browser storage refuses it', () => {
  open();
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Denied', 'SecurityError'); });
  fireEvent.change(screen.getByLabelText('Clear copied data automatically'), { target: { value: '300000' } });
  expect(screen.getByLabelText<HTMLSelectElement>('Clear copied data automatically').value).toBe('300000');
  expect(screen.getByText(/storage is unavailable/i)).toBeTruthy();
});
