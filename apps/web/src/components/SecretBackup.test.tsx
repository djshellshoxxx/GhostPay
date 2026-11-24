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

/** Clicks and lets the clipboard promise settle. */
async function clickAndSettle(name: string): Promise<void> {
  await act(async () => {
    click(name);
    await Promise.resolve();
  });
}

/** Lets pending clipboard promises settle. */
async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

/** Shows the backup and copies it, confirmed. */
async function copyBackup(): Promise<void> {
  click('Show backup seed');
  click('Copy seed');
  await clickAndSettle('Copy anyway');
  expect(screen.getByRole('status').textContent).toMatch(/Copied/);
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

  it('copies only after a warned second click, and Hide leaves the clipboard alone by default', async () => {
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
    expect(screen.queryByText(SECRET)).toBeNull();
    expect(writeText).toHaveBeenCalledExactlyOnceWith(SECRET);
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
    expect(writeText).not.toHaveBeenCalled();
  });

  it('hides the secret when the clipboard API disappears', async () => {
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

  it('ignores a stale successful copy after Hide and a new reveal', async () => {
    let finishCopy!: () => void;
    writeText.mockImplementationOnce(() => new Promise<void>((resolve) => { finishCopy = resolve; }));
    setup();
    click('Show backup seed');
    click('Copy seed');
    click('Copy anyway');
    click('Hide seed');
    await settle();
    click('Show backup seed');
    finishCopy();
    await settle();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('button', { name: 'Copy seed' })).toBeTruthy();
    expect(writeText.mock.calls.map(([value]) => value)).toEqual([SECRET]);
  });

  it('ignores a stale failed copy after Hide and a new reveal', async () => {
    let rejectCopy!: (reason: Error) => void;
    writeText.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectCopy = reject; }));
    setup();
    click('Show backup seed');
    click('Copy seed');
    click('Copy anyway');
    click('Hide seed');
    await settle();
    click('Show backup seed');
    rejectCopy(new Error('permission refused'));
    await settle();
    expect(screen.queryByRole('status')).toBeNull();
    expect(writeText.mock.calls.map(([value]) => value)).toEqual([SECRET]);
  });

  it('prevents duplicate confirmations while a copy is pending and keeps Hide available', async () => {
    let finishCopy!: () => void;
    writeText.mockImplementationOnce(() => new Promise<void>((resolve) => { finishCopy = resolve; }));
    setup();
    click('Show backup seed');
    click('Copy seed');
    click('Copy anyway');
    expect(screen.getByRole('button', { name: 'Copy anyway' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Do not copy' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Hide seed' }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('status').textContent).toBe('Copying backup to the clipboard…');
    click('Copy anyway');
    expect(writeText).toHaveBeenCalledExactlyOnceWith(SECRET);
    finishCopy();
    await settle();
    expect(screen.getByRole('status').textContent).toMatch(/^Copied/);
  });

  it('does not clear or relabel a newer copy when an obsolete copy settles', async () => {
    let finishFirst!: () => void;
    writeText.mockImplementationOnce(() => new Promise<void>((resolve) => { finishFirst = resolve; }));
    setup();
    click('Show backup seed');
    click('Copy seed');
    click('Copy anyway');
    click('Hide seed');
    await settle();
    await copyBackup();
    finishFirst();
    await settle();
    expect(writeText.mock.calls.map(([value]) => value)).toEqual([SECRET, SECRET]);
    expect(screen.getByRole('status').textContent).toMatch(/^Copied/);
    click('Hide seed');
    expect(writeText.mock.calls.map(([value]) => value)).toEqual([SECRET, SECRET]);
  });

  it('auto-hide and app lock hide the backup while clipboard clearing is off', async () => {
    vi.useFakeTimers();
    setup();
    await copyBackup();
    act(() => { vi.advanceTimersByTime(BACKUP_VISIBLE_MS); });
    expect(screen.queryByText(SECRET)).toBeNull();
    expect(writeText).toHaveBeenCalledExactlyOnceWith(SECRET);
    await settle();
    click('Show backup seed');
    expect(screen.getByText(SECRET)).toBeTruthy();
    act(() => { notifyAppLock('idle'); });
    expect(screen.queryByText(SECRET)).toBeNull();
  });

  it('does not schedule a clear for a pending unmounted copy while protection is off', async () => {
    let finishCopy!: () => void;
    writeText.mockImplementationOnce(() => new Promise<void>((resolve) => { finishCopy = resolve; }));
    setup();
    click('Show backup seed');
    click('Copy seed');
    click('Copy anyway');
    cleanup();
    await settle();
    finishCopy();
    await settle();
    expect(writeText.mock.calls.map(([value]) => value)).toEqual([SECRET]);
  });
});
