// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PART_INTERVAL_MS, QrFrame } from './QrFrame';

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('QR reveal and dialog scopes', () => {
  it('requires explicit reveal when a public frame is replaced with secret data', () => {
    const { rerender } = render(<QrFrame kind="shareable" text="public" caption="Public configuration" />);
    expect(screen.getByRole('img')).toBeTruthy();
    rerender(<QrFrame kind="secret" text="new-secret" caption="Secret backup" />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByRole('button', { name: 'Reveal secret QR code' })).toBeTruthy();
  });

  it('hides a replacement secret and requires a new explicit reveal', () => {
    const { rerender } = render(<QrFrame kind="secret" text="first-secret" caption="Secret backup" />);
    fireEvent.click(screen.getByRole('button', { name: 'Reveal secret QR code' }));
    expect(screen.getByRole('img')).toBeTruthy();
    rerender(<QrFrame kind="secret" text="second-secret" caption="Secret backup" />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copy as text' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Download SVG' })).toBeNull();
  });

  it('binds reveal to multipart bytes as well as the full-text fallback', () => {
    const { rerender } = render(<QrFrame kind="secret" text="fallback" chunks={['part-a', 'part-b']} caption="Secret backup" />);
    fireEvent.click(screen.getByRole('button', { name: 'Reveal secret QR code' }));
    rerender(<QrFrame kind="secret" text="fallback" chunks={['changed', 'part-b']} caption="Secret backup" />);
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('dismisses a stale large dialog and restores focus to the new reveal control', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<QrFrame kind="secret" text="first" caption="Secret backup" />);
    await user.click(screen.getByRole('button', { name: 'Reveal secret QR code' }));
    await user.click(screen.getByRole('button', { name: 'Show larger' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    rerender(<QrFrame kind="secret" text="second" caption="Secret backup" />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Reveal secret QR code' }));
  });

  it('does not extend a secret reveal deadline when labels or equivalent chunk arrays change', () => {
    vi.useFakeTimers();
    const { rerender } = render(<QrFrame kind="secret" text="same" chunks={['one', 'two']} caption="Before" />);
    fireEvent.click(screen.getByRole('button', { name: 'Reveal secret QR code' }));
    act(() => { vi.advanceTimersByTime(30_000); });
    rerender(<QrFrame kind="secret" text="same" chunks={['one', 'two']} caption="After" />);
    expect(screen.getByRole('img', { name: 'After' })).toBeTruthy();
    act(() => { vi.advanceTimersByTime(30_001); });
    expect(screen.queryByRole('img')).toBeNull();
  });
});

describe('large QR keyboard operation', () => {
  it('confines Tab and Shift+Tab to enabled dialog controls and returns focus on Escape', async () => {
    const user = userEvent.setup();
    render(<><button>Before frame</button><QrFrame kind="proof" text="receipt" chunks={['one', 'two']} caption="Receipt" /><button>After frame</button></>);
    const opener = screen.getByRole('button', { name: 'Show larger' });
    await user.click(opener);
    const dialog = within(screen.getByRole('dialog'));
    const close = dialog.getByRole('button', { name: 'Close' });
    const next = dialog.getByRole('button', { name: 'Next part' });
    expect(document.activeElement).toBe(close);
    await user.tab();
    expect(document.activeElement).toBe(next);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(close);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('brings outside focus back into the open dialog', async () => {
    const user = userEvent.setup();
    render(<><QrFrame kind="proof" text="receipt" caption="Receipt" /><button>Outside frame</button></>);
    await user.click(screen.getByRole('button', { name: 'Show larger' }));
    act(() => { screen.getByRole('button', { name: 'Outside frame' }).focus(); });
    expect(document.activeElement).toBe(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }));
  });
});

it('stops automatic multipart motion immediately when the device preference changes', () => {
  vi.useFakeTimers();
  let change: (() => void) | undefined;
  const query = {
    matches: false,
    addEventListener: (_name: string, listener: () => void) => { change = listener; },
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal('matchMedia', () => query);
  render(<QrFrame kind="proof" text="receipt" chunks={['one', 'two']} caption="Receipt" />);
  fireEvent.click(screen.getByRole('checkbox'));
  act(() => { vi.advanceTimersByTime(PART_INTERVAL_MS); });
  expect(screen.getByText('Part 2 of 2')).toBeTruthy();
  act(() => { query.matches = true; change?.(); });
  expect(screen.queryByRole('checkbox')).toBeNull();
  act(() => { vi.advanceTimersByTime(PART_INTERVAL_MS); });
  expect(screen.getByText('Part 2 of 2')).toBeTruthy();
  act(() => { query.matches = false; change?.(); });
  expect(screen.getByRole<HTMLInputElement>('checkbox').checked).toBe(false);
});
