// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppContext, type AppState } from '../state';
import { DEFAULT_SETTINGS, type Settings } from '../lib/settings';
import { CopyButton } from './Common';
import { englishBackupText, SecretBackup } from './SecretBackup';

const value = 'synthetic backup';
function fixture(seconds: Settings['invoiceLinkClipboardDelaySec']) {
  const app: AppState = {
    view: 'seller', setView: () => undefined, settings: { ...DEFAULT_SETTINGS, invoiceLinkClipboardDelaySec: seconds },
    updateSettings: () => true, session: undefined, fragment: undefined, setFragment: () => undefined,
    matches: [], setMatches: () => undefined, sweepTarget: undefined, selectForSweep: () => undefined,
    getRpc: () => Promise.resolve(undefined), getSecondaryRpc: () => Promise.resolve(undefined), announce: () => undefined,
  };
  return render(<AppContext.Provider value={app}>
    <CopyButton text={value} label="Copy address" />
    <SecretBackup reveal={() => value} text={englishBackupText('seed')} />
  </AppContext.Provider>);
}

function clipboard() {
  const state = { text: '' };
  const readText = vi.fn(() => Promise.resolve(state.text));
  const writeText = vi.fn((next: string) => { state.text = next; return Promise.resolve(); });
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText, writeText } });
  return { state, readText, writeText };
}

const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
async function copyBackup() {
  click('Show backup seed');
  click('Copy seed');
  await act(async () => { click('Copy anyway'); await Promise.resolve(); });
}
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); });

it.each([0, 30, 60] as const)('applies the saved %i-second delay to a shared button across unmount', async (seconds) => {
  const { state, readText, writeText } = clipboard();
  const panel = fixture(seconds);
  await act(async () => { click('Copy address'); await Promise.resolve(); });
  panel.unmount();
  const until = seconds * 1000 || 300_000;
  await vi.advanceTimersByTimeAsync(until - 1);
  expect(state.text).toBe(value);
  expect(readText).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(state.text).toBe(seconds ? '' : value);
  expect(writeText).toHaveBeenCalledTimes(seconds ? 2 : 1);
});

it.each([0, 30, 60] as const)('respects the %i-second setting for a confirmed backup after unmount', async (seconds) => {
  const { state, readText } = clipboard();
  const panel = fixture(seconds);
  await copyBackup();
  panel.unmount();
  await vi.advanceTimersByTimeAsync((seconds * 1000 || 300_000) - 1);
  expect(state.text).toBe(value);
  expect(readText).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(state.text).toBe(seconds ? '' : value);
});

it('gives an identical recopy through another component its own deadline', async () => {
  const { state, readText } = clipboard();
  fixture(30);
  await copyBackup();
  await vi.advanceTimersByTimeAsync(29_999);
  await act(async () => { click('Copy address'); await Promise.resolve(); });
  click('Hide seed');
  await vi.advanceTimersByTimeAsync(1);
  expect(state.text).toBe(value);
  expect(readText).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(29_999);
  expect(state.text).toBe('');
});

it('preserves unrelated clipboard content across Hide, unmount and the deadline', async () => {
  const { state, writeText } = clipboard();
  const panel = fixture(30);
  await copyBackup();
  state.text = 'from another application';
  click('Hide seed');
  panel.unmount();
  await vi.advanceTimersByTimeAsync(30_000);
  expect(state.text).toBe('from another application');
  expect(writeText).toHaveBeenCalledOnce();
});

it.each(['copy', 'read', 'clear', 'missing'] as const)('handles backup clipboard failure at %s', async (failure) => {
  const { state, readText, writeText } = clipboard();
  const denied = new DOMException('Denied', 'NotAllowedError');
  if (failure === 'copy') writeText.mockRejectedValueOnce(denied);
  if (failure === 'read') readText.mockRejectedValueOnce(denied);
  if (failure === 'missing') Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
  const panel = fixture(30);
  await copyBackup();
  const copied = failure === 'read' || failure === 'clear';
  expect(screen.getByRole('status').textContent).toMatch(copied ? /^Copied/ : /Copy failed/);
  if (failure === 'clear') writeText.mockRejectedValueOnce(denied);
  panel.unmount();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(state.text).toBe(copied ? value : '');
  expect(writeText.mock.calls.filter(([text]) => text === '')).toHaveLength(failure === 'clear' ? 1 : 0);
});

it.each(['mounted', 'unmounted'] as const)('guards a %s backup queued behind an already-dispatched clear', async (lifetime) => {
  const { state, writeText } = clipboard();
  const panel = fixture(30);
  await act(async () => { click('Copy address'); await Promise.resolve(); });
  let finishClear!: () => void;
  writeText.mockImplementationOnce(() => new Promise<void>((resolve) => {
    finishClear = () => { state.text = ''; resolve(); };
  }));
  await vi.advanceTimersByTimeAsync(30_000);
  await copyBackup();
  expect(writeText.mock.calls).toEqual([[value], ['']]);
  if (lifetime === 'unmounted') panel.unmount();
  await act(async () => { finishClear(); await Promise.resolve(); });
  expect(state.text).toBe(lifetime === 'mounted' ? value : '');
  expect(writeText.mock.calls.length).toBe(lifetime === 'mounted' ? 3 : 2);
});

it('starts the cleanup delay when a dispatched backup write settles after unmount', async () => {
  const { state, readText, writeText } = clipboard();
  let finishWrite!: () => void;
  writeText.mockImplementationOnce((next) => new Promise<void>((resolve) => {
    finishWrite = () => { state.text = next; resolve(); };
  }));
  const panel = fixture(30);
  await copyBackup();
  panel.unmount();
  await vi.advanceTimersByTimeAsync(30_001);
  expect(writeText).toHaveBeenCalledOnce();
  await act(async () => { finishWrite(); await Promise.resolve(); });
  await vi.advanceTimersByTimeAsync(29_999);
  expect(state.text).toBe(value);
  expect(readText).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(state.text).toBe('');
});
