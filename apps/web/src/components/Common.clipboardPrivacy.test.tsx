// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CopyButton } from './Common';
import { cancelClipboardCleanup, recordClipboardCopy } from '../lib/clipboardPrivacy';
import { AppContext, type AppState } from '../state';
import { DEFAULT_SETTINGS, type ClipboardClearAfterMs } from '../lib/settings';
import { ClipboardPrivacySync } from './ClipboardPrivacySync';

afterEach(() => {
  cleanup();
  cancelClipboardCleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
});

function fixture(delay: ClipboardClearAfterMs, showCopy = true) {
  const state: AppState = {
    view: 'home', setView: () => undefined, settings: { ...DEFAULT_SETTINGS, clipboardClearAfterMs: delay },
    updateSettings: () => true, session: undefined, fragment: undefined, setFragment: () => undefined,
    matches: [], setMatches: () => undefined, sweepTarget: undefined, selectForSweep: () => undefined,
    getRpc: () => Promise.resolve(undefined), getSecondaryRpc: () => Promise.resolve(undefined), announce: () => undefined,
  };
  return <AppContext.Provider value={state}><ClipboardPrivacySync />{showCopy && <CopyButton text="private receipt" label="Copy receipt" />}</AppContext.Provider>;
}

it('uses the saved preference for an ordinary shared CopyButton and leaves disabled copies alone', async () => {
  vi.useFakeTimers();
  let value = '';
  const port = { readText: vi.fn(() => Promise.resolve(value)), writeText: vi.fn((next: string) => { value = next; return Promise.resolve(); }) };
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: port });
  const { rerender } = render(fixture(30_000));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy receipt' })); await Promise.resolve(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(29_999); });
  expect(value).toBe('private receipt');
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(value).toBe('');
  expect(port.readText).toHaveBeenCalledTimes(2);
  rerender(fixture(0));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copied' })); await Promise.resolve(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(300_000); });
  expect(value).toBe('private receipt');
  expect(port.readText).toHaveBeenCalledTimes(2);
});

it('cancels a pending comparison when protection is disabled after the copying view unmounts', async () => {
  vi.useFakeTimers();
  let completeRead!: (value: string) => void;
  const read = new Promise<string>((resolve) => { completeRead = resolve; });
  const port = { readText: vi.fn(() => read), writeText: vi.fn(() => Promise.resolve()) };
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: port });
  const { rerender } = render(fixture(30_000));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy receipt' })); await Promise.resolve(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
  expect(port.readText).toHaveBeenCalledOnce();
  rerender(fixture(0, false));
  await act(async () => { completeRead('private receipt'); await read; });
  await act(async () => { await vi.advanceTimersByTimeAsync(300_000); });
  expect(port.readText).toHaveBeenCalledOnce();
  expect(port.writeText).toHaveBeenCalledExactlyOnceWith('private receipt');
});

it('does not rearm cancelled cleanup when a pending copy succeeds after disabling and re-enabling', async () => {
  vi.useFakeTimers();
  let completeWrite!: () => void;
  const write = new Promise<void>((resolve) => { completeWrite = resolve; });
  const port = { readText: vi.fn(() => Promise.resolve('private receipt')), writeText: vi.fn(() => write) };
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: port });
  const { rerender } = render(fixture(30_000));
  fireEvent.click(screen.getByRole('button', { name: 'Copy receipt' }));
  rerender(fixture(0));
  rerender(fixture(30_000));
  await act(async () => { completeWrite(); await write; });
  await act(async () => { await vi.advanceTimersByTimeAsync(300_000); });
  expect(port.readText).not.toHaveBeenCalled();
  expect(port.writeText).toHaveBeenCalledExactlyOnceWith('private receipt');
});

it('lets an already-dispatched cleanup finish before writing a newer app copy', async () => {
  vi.useFakeTimers();
  let value = '';
  let completeClear!: () => void;
  const clear = new Promise<void>((resolve) => { completeClear = resolve; });
  const port = {
    readText: vi.fn(() => Promise.resolve(value)),
    writeText: vi.fn((next: string) => {
      if (next === '') return clear.then(() => { value = ''; });
      value = next;
      return Promise.resolve();
    }),
  };
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: port });
  const { rerender } = render(<CopyButton text="older" label="Copy older" autoClearAfterMs={1000} />);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy older' })); await Promise.resolve(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(port.writeText.mock.calls.map(([text]) => text)).toEqual(['older', '']);
  rerender(<CopyButton text="newer" label="Copy newer" />);
  fireEvent.click(screen.getByRole('button', { name: 'Copy newer' }));
  expect(port.writeText).not.toHaveBeenCalledWith('newer');
  await act(async () => { completeClear(); await clear; });
  expect(port.writeText.mock.calls.map(([text]) => text)).toEqual(['older', '', 'newer']);
  expect(value).toBe('newer');
  expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy();
});

it('keeps copied data when clipboard reading is unsupported', async () => {
  vi.useFakeTimers();
  const writeText = vi.fn(() => Promise.resolve());
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  render(fixture(30_000));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy receipt' })); await Promise.resolve(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
  expect(writeText).toHaveBeenCalledExactlyOnceWith('private receipt');
  expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy();
});

it('issue286 audit: a stale ordinary copy completion cannot cancel a newer sensitive cleanup', async () => {
  vi.useFakeTimers();
  let clipboard = '';
  let settleOld!: () => void;
  const oldWrite = new Promise<void>((resolve) => { settleOld = resolve; });
  const port = {
    readText: vi.fn(() => Promise.resolve(clipboard)),
    writeText: vi.fn((text: string) => {
      clipboard = text;
      return text === 'old ordinary value' ? oldWrite : Promise.resolve();
    }),
  };
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: port });
  const { rerender } = render(<CopyButton text="old ordinary value" label="Copy old" autoClearAfterMs={0} />);
  fireEvent.click(screen.getByRole('button', { name: 'Copy old' }));
  rerender(<CopyButton text="new sensitive value" label="Copy new" autoClearAfterMs={1000} />);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy new' })); await Promise.resolve(); });
  expect(clipboard).toBe('new sensitive value');
  expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy();
  await act(async () => { settleOld(); await oldWrite; });
  expect(clipboard).toBe('new sensitive value');
  // UI already rejects the stale completion; the helper side effect must do so too.
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(clipboard).toBe('');
});

it('issue286 audit positive control: newer external content before comparison is preserved', async () => {
  vi.useFakeTimers();
  let clipboard = 'copied value';
  const port = { readText: vi.fn(() => Promise.resolve(clipboard)), writeText: vi.fn((text: string) => { clipboard = text; return Promise.resolve(); }) };
  recordClipboardCopy('copied value', port, 1000);
  clipboard = 'external replacement';
  await vi.advanceTimersByTimeAsync(1000);
  expect(port.writeText).not.toHaveBeenCalled();
  expect(clipboard).toBe('external replacement');
});

it('issue286 audit limitation: the second read cannot make the compare and write atomic', async () => {
  vi.useFakeTimers();
  let clipboard = 'copied value';
  let reads = 0;
  const port = {
    readText: vi.fn(() => {
      const snapshot = clipboard;
      if (++reads === 2) clipboard = 'external change after the last snapshot';
      return Promise.resolve(snapshot);
    }),
    writeText: vi.fn((text: string) => { clipboard = text; return Promise.resolve(); }),
  };
  recordClipboardCopy('copied value', port, 1000);
  await vi.advanceTimersByTimeAsync(1000);
  expect(reads).toBe(2);
  // This is a characterization of the browser-port limit, not a claim of absolute protection.
  expect(port.writeText).toHaveBeenCalledExactlyOnceWith('');
  expect(clipboard).toBe('');
});
