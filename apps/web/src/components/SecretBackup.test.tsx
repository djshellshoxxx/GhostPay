// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notifyAppLock } from '../lib/appLock';
import { BACKUP_VISIBLE_MS, englishBackupText, SecretBackup } from './SecretBackup';

const SECRET = 'ab'.repeat(32);
const writeText = vi.fn<(text: string) => Promise<void>>();
let visibility: DocumentVisibilityState = 'visible';

function setup() {
  const reveal = vi.fn(() => SECRET);
  render(<SecretBackup reveal={reveal} text={englishBackupText('seed')} />);
  return { reveal };
}

const click = (name: string): void => {
  fireEvent.click(screen.getByRole('button', { name }));
};

/** Lets pending promises settle. */
async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('SecretBackup', () => {
  beforeEach(() => {
    writeText.mockReset();
    writeText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    visibility = 'visible';
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('keeps the backup out of the page until asked for, and can show it again while loaded', () => {
    const { reveal } = setup();
    expect(reveal).not.toHaveBeenCalled();
    expect(screen.queryByText(SECRET)).toBeNull();
    expect(screen.getByText('Backup seed')).toBeTruthy();
    expect(screen.getByText(/Anyone with this seed controls the wallet/).textContent).toMatch(/It is hidden/);
    click('Show backup seed');
    expect(reveal).toHaveBeenCalledTimes(1);
    expect(screen.getByText(SECRET)).toBeTruthy();
    click('Hide seed');
    expect(screen.queryByText(SECRET)).toBeNull();
    click('Show backup seed');
    expect(reveal).toHaveBeenCalledTimes(2);
    expect(screen.getByText(SECRET)).toBeTruthy();
  });

  it('hides itself after a minute', () => {
    vi.useFakeTimers();
    setup();
    click('Show backup seed');
    act(() => { vi.advanceTimersByTime(BACKUP_VISIBLE_MS - 1); });
    expect(screen.getByText(SECRET)).toBeTruthy();
    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.queryByText(SECRET)).toBeNull();
    // Showing it again starts a new minute.
    click('Show backup seed');
    act(() => { vi.advanceTimersByTime(BACKUP_VISIBLE_MS - 1); });
    expect(screen.getByText(SECRET)).toBeTruthy();
  });

  it('hides itself as soon as the tab is hidden', () => {
    setup();
    click('Show backup seed');
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(screen.getByText(SECRET)).toBeTruthy();
    visibility = 'hidden';
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(screen.queryByText(SECRET)).toBeNull();
  });

  it('the app lock hides a still-mounted reveal', () => {
    setup();
    click('Show backup seed');
    act(() => { notifyAppLock('idle'); });
    expect(screen.queryByText(SECRET)).toBeNull();
  });

  it('offers no copy control while shown: only Hide remains', () => {
    setup();
    click('Show backup seed');
    expect(screen.queryByRole('button', { name: /copy/i })).toBeNull();
    expect(screen.queryByText(/clipboard/i)).toBeNull();
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Hide seed']);
  });

  it('never writes to the clipboard (not even an empty clear) through reveal, hide, auto-hide, tab hide, lock and unmount', async () => {
    vi.useFakeTimers();
    setup();
    click('Show backup seed');
    click('Hide seed');
    click('Show backup seed');
    act(() => { vi.advanceTimersByTime(BACKUP_VISIBLE_MS); });
    click('Show backup seed');
    visibility = 'hidden';
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    visibility = 'visible';
    click('Show backup seed');
    act(() => { notifyAppLock('manual'); });
    click('Show backup seed');
    // A click or key press anywhere must not trigger any deferred clipboard clear either.
    fireEvent.click(document.body);
    fireEvent.keyDown(document.body, { key: 'a' });
    cleanup();
    notifyAppLock('idle');
    await settle();
    expect(writeText).not.toHaveBeenCalled();
  });

  it('has English texts for keys as well as seeds, without any copy wording', () => {
    const keys = englishBackupText('keys');
    expect(keys.title).toBe('Backup keys');
    expect(keys.warning).toMatch(/these keys controls the wallet/);
    expect(keys.show).toBe('Show backup keys');
    expect(keys.hide).toBe('Hide keys');
    expect(Object.keys(keys).sort()).toEqual(['hiddenHint', 'hide', 'show', 'title', 'warning']);
  });
});
