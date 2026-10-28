// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BACKUP_VISIBLE_MS, clearCopiedBackup, englishBackupText, SecretBackup } from './SecretBackup';

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

/** Clicks and lets the clipboard promise settle. */
async function clickAndSettle(name: string): Promise<void> {
  await act(async () => {
    click(name);
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
    // Reset the module's "copied" mark so tests stay independent.
    clearCopiedBackup();
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
    // Nothing was copied, so Hide leaves the clipboard alone.
    expect(writeText).not.toHaveBeenCalled();
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

  it('copies only after a warned second click, and Hide empties the clipboard again', async () => {
    setup();
    click('Show backup seed');
    click('Copy seed');
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.getByText(/Other apps and web pages can read the clipboard/)).toBeTruthy();
    click('Do not copy');
    expect(screen.queryByText(/Other apps and web pages can read the clipboard/)).toBeNull();
    expect(writeText).not.toHaveBeenCalled();

    click('Copy seed');
    await clickAndSettle('Copy anyway');
    expect(writeText).toHaveBeenCalledExactlyOnceWith(SECRET);
    expect(screen.getByRole('status').textContent).toMatch(/Copied/);
    click('Hide seed');
    expect(writeText).toHaveBeenLastCalledWith('');
    // Cleared once: a second clear does not touch the clipboard again.
    clearCopiedBackup();
    expect(writeText).toHaveBeenCalledTimes(2);
  });

  it('reports a failed copy and then leaves the clipboard alone', async () => {
    writeText.mockRejectedValueOnce(new Error('denied'));
    setup();
    click('Show backup seed');
    click('Copy seed');
    await clickAndSettle('Copy anyway');
    expect(screen.getByRole('status').textContent).toMatch(/Copy failed: select the text manually/);
    click('Hide seed');
    expect(writeText).toHaveBeenCalledTimes(1);
  });

  it('works without a clipboard API', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    setup();
    click('Show backup seed');
    click('Copy seed');
    await clickAndSettle('Copy anyway');
    expect(screen.getByRole('status').textContent).toMatch(/Copy failed/);
    expect(() => {
      clearCopiedBackup();
    }).not.toThrow();
  });

  it('clears a clipboard API that throws without failing the Hide', async () => {
    setup();
    click('Show backup seed');
    click('Copy seed');
    await clickAndSettle('Copy anyway');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    expect(() => {
      click('Hide seed');
    }).not.toThrow();
    expect(screen.queryByText(SECRET)).toBeNull();
  });

  it('has English texts for keys as well as seeds', () => {
    const keys = englishBackupText('keys');
    expect(keys.title).toBe('Backup keys');
    expect(keys.warning).toMatch(/these keys controls the wallet/);
    expect(keys.show).toBe('Show backup keys');
    expect(keys.hide).toBe('Hide keys');
  });
});
