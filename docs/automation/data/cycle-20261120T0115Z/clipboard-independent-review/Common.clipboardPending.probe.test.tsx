// @vitest-environment jsdom
// Reviewer-only probe against unchanged PR #293 source; not a production patch.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CopyButton } from './Common';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it.each(['same value', 'different value'])('does not let old cleanup erase a pending re-copy of %s', async (nextValue) => {
  vi.useFakeTimers();
  let clipboard = '';
  let nonemptyWrites = 0;
  let settleSecond!: () => void;
  const writeText = vi.fn((text: string): Promise<void> => {
    clipboard = text;
    if (text !== '' && ++nonemptyWrites === 2) {
      return new Promise<void>((resolve) => { settleSecond = resolve; });
    }
    return Promise.resolve();
  });
  const readText = vi.fn(() => Promise.resolve(clipboard));
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText, writeText } });
  const view = render(<CopyButton text="same value" label="Copy" autoClearAfterMs={30_000} />);
  fireEvent.click(screen.getByRole('button'));
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
  view.rerender(<CopyButton text={nextValue} label="Copy" autoClearAfterMs={30_000} />);
  fireEvent.click(screen.getByRole('button'));
  expect(clipboard).toBe(nextValue);
  await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
  await act(async () => { settleSecond(); await Promise.resolve(); });
  expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy();
  expect(clipboard).toBe(nextValue);
});
