// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notifyAppLock } from '../lib/appLock';
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

/** Lets pending clipboard promises settle. */
async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

/** How browsers refuse a clipboard write without user activation (the app's idle lock) or in a background tab. */
const refused = (): Promise<void> => Promise.reject(new DOMException('Document is not focused.', 'NotAllowedError'));

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
  afterEach(async () => {
    cleanup();
    vi.useRealTimers();
    // Clear the module's "copied" mark (and a pending retry) with a working clipboard, so tests stay independent.
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.resolve() } });
    clearCopiedBackup();
    await Promise.resolve();
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

  it('keeps the backup marked when emptying the clipboard is refused, so a later Lock or Hide empties it', async () => {
    setup();
    await copyBackup();
    // Lock (each view calls clearCopiedBackup) without user activation: the browser refuses.
    writeText.mockImplementationOnce(refused);
    clearCopiedBackup();
    await settle();
    expect(writeText).toHaveBeenCalledTimes(2);
    expect(writeText).toHaveBeenLastCalledWith('');
    // The seed may still be on the clipboard: the next Hide tries again, and this time it works.
    click('Hide seed');
    expect(writeText).toHaveBeenCalledTimes(3);
    expect(writeText).toHaveBeenLastCalledWith('');
    await settle();
    // Emptied: later clears leave the clipboard alone.
    clearCopiedBackup();
    expect(writeText).toHaveBeenCalledTimes(3);
  });

  it('keeps a copied backup marked after a synchronous clear failure and retries on activation', async () => {
    setup();
    await copyBackup();
    writeText.mockImplementationOnce(() => { throw new DOMException('Clipboard unavailable.', 'NotAllowedError'); });
    expect(() => clearCopiedBackup()).not.toThrow();
    expect(writeText).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(document.body, { key: 'a' });
    expect(writeText).toHaveBeenCalledTimes(3);
    expect(writeText).toHaveBeenLastCalledWith('');
    await settle();
    fireEvent.keyDown(document.body, { key: 'b' });
    clearCopiedBackup();
    expect(writeText).toHaveBeenCalledTimes(3);
  });

  it('starts clearing synchronously and retains the mark if that promise later rejects', async () => {
    setup();
    await copyBackup();
    let rejectClear!: (error: unknown) => void;
    writeText.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectClear = reject; }));
    clearCopiedBackup();
    expect(writeText).toHaveBeenCalledTimes(2);
    expect(rejectClear).toBeDefined();
    clearCopiedBackup();
    expect(writeText).toHaveBeenCalledTimes(2);
    rejectClear(new DOMException('Document is not focused.', 'NotAllowedError'));
    await settle();
    fireEvent.click(document.body);
    expect(writeText).toHaveBeenCalledTimes(3);
    await settle();
    clearCopiedBackup();
    expect(writeText).toHaveBeenCalledTimes(3);
  });

  it('retains a copied-backup mark if the clipboard API disappears, then clears on the next available activation', async () => {
    setup();
    await copyBackup();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    expect(() => clearCopiedBackup()).not.toThrow();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    fireEvent.keyDown(document.body, { key: 'a' });
    expect(writeText).toHaveBeenCalledTimes(2);
    expect(writeText).toHaveBeenLastCalledWith('');
    await settle();
    clearCopiedBackup();
    expect(writeText).toHaveBeenCalledTimes(2);
  });

  it('retries a refused clear at the next click or key press anywhere in the page, once it worked no more', async () => {
    setup();
    await copyBackup();
    writeText.mockImplementationOnce(refused);
    clearCopiedBackup();
    await settle();
    expect(writeText).toHaveBeenCalledTimes(2);
    // A key press that the browser still refuses keeps the retry; the next click (user activation) empties it.
    writeText.mockImplementationOnce(refused);
    fireEvent.keyDown(document.body, { key: 'a' });
    expect(writeText).toHaveBeenCalledTimes(3);
    await settle();
    fireEvent.click(document.body);
    expect(writeText).toHaveBeenCalledTimes(4);
    expect(writeText).toHaveBeenLastCalledWith('');
    await settle();
    fireEvent.click(document.body);
    fireEvent.keyDown(document.body, { key: 'a' });
    click('Hide seed');
    expect(writeText).toHaveBeenCalledTimes(4);
  });

  it('a retry runs before the handlers of the click that triggers it, so it never empties the copy that click makes', async () => {
    setup();
    await copyBackup();
    writeText.mockImplementationOnce(refused);
    clearCopiedBackup();
    await settle();
    // Still refused at the next click (Copy seed), so the retry is still waiting at Copy anyway.
    writeText.mockImplementationOnce(refused);
    click('Copy seed');
    await settle();
    await clickAndSettle('Copy anyway');
    expect(writeText.mock.calls.map(([text]) => text)).toEqual([SECRET, '', '', '', SECRET]);
    expect(screen.getByRole('status').textContent).toMatch(/Copied/);
    // The retry worked: later clicks leave the new copy alone, and Hide empties it.
    fireEvent.click(document.body);
    expect(writeText).toHaveBeenCalledTimes(5);
    click('Hide seed');
    expect(writeText).toHaveBeenCalledTimes(6);
    expect(writeText).toHaveBeenLastCalledWith('');
  });

  it('empties the clipboard when it unmounts (its view is left), like Lock', async () => {
    setup();
    await copyBackup();
    cleanup();
    expect(writeText).toHaveBeenCalledTimes(2);
    expect(writeText).toHaveBeenLastCalledWith('');
    await settle();
    // Emptied: later clears leave the clipboard alone.
    clearCopiedBackup();
    expect(writeText).toHaveBeenCalledTimes(2);
  });

  it('after its view is gone, the app lock still empties a copied backup', async () => {
    setup();
    await copyBackup();
    // Left without user activation (an invoice link opened another view), so the browser refused at unmount.
    writeText.mockImplementationOnce(refused);
    cleanup();
    await settle();
    expect(writeText).toHaveBeenCalledTimes(2);
    // No view's own lock runs any more; the app lock still empties it (a focused page allows that in some browsers).
    act(() => { notifyAppLock('idle'); });
    expect(writeText).toHaveBeenCalledTimes(3);
    expect(writeText).toHaveBeenLastCalledWith('');
    await settle();
    fireEvent.click(document.body);
    expect(writeText).toHaveBeenCalledTimes(3);
  });

  it('after its view is gone and the app lock was refused too, the next click empties the clipboard', async () => {
    setup();
    await copyBackup();
    writeText.mockImplementationOnce(refused);
    cleanup();
    await settle();
    writeText.mockImplementationOnce(refused);
    act(() => { notifyAppLock('idle'); });
    await settle();
    expect(writeText.mock.calls.map(([text]) => text)).toEqual([SECRET, '', '']);
    fireEvent.click(document.body);
    expect(writeText).toHaveBeenCalledTimes(4);
    expect(writeText).toHaveBeenLastCalledWith('');
    await settle();
    fireEvent.keyDown(document.body, { key: 'a' });
    expect(writeText).toHaveBeenCalledTimes(4);
  });

  it('unmounting while a refused clear waits for the next click or key press does not try again without one', async () => {
    setup();
    await copyBackup();
    // The app lock without user activation: refused, and then it unmounts the backup (the view locks).
    writeText.mockImplementationOnce(refused);
    act(() => { notifyAppLock('idle'); });
    await settle();
    expect(writeText).toHaveBeenCalledTimes(2);
    cleanup();
    expect(writeText).toHaveBeenCalledTimes(2);
    // The waiting retry runs at the next click.
    fireEvent.click(document.body);
    expect(writeText).toHaveBeenCalledTimes(3);
    expect(writeText).toHaveBeenLastCalledWith('');
  });

  it('a clear that settles after a newer copy started leaves the newer copy marked', async () => {
    setup();
    await copyBackup();
    let finishClear: () => void = () => undefined;
    writeText.mockImplementationOnce(() => new Promise<void>((resolve) => { finishClear = resolve; }));
    click('Hide seed');
    expect(writeText).toHaveBeenLastCalledWith('');
    // Copied again while the clear is still pending.
    await copyBackup();
    expect(writeText).toHaveBeenLastCalledWith(SECRET);
    finishClear();
    await settle();
    // The second copy is on the clipboard: Hide empties it.
    click('Hide seed');
    expect(writeText).toHaveBeenCalledTimes(4);
    expect(writeText).toHaveBeenLastCalledWith('');
  });

  it('a failed copy leaves an earlier copy that is still on the clipboard marked', async () => {
    setup();
    await copyBackup();
    writeText.mockRejectedValueOnce(new Error('denied'));
    click('Copy seed');
    await clickAndSettle('Copy anyway');
    expect(screen.getByRole('status').textContent).toMatch(/Copy failed/);
    click('Hide seed');
    expect(writeText).toHaveBeenCalledTimes(3);
    expect(writeText).toHaveBeenLastCalledWith('');
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

  it('ignores a stale successful copy after Hide and a new reveal, and clears the late write best-effort', async () => {
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
    expect(writeText.mock.calls.map(([value]) => value)).toEqual([SECRET, '', '']);
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
    expect(writeText.mock.calls.map(([value]) => value)).toEqual([SECRET, '']);
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
    expect(writeText.mock.calls.map(([value]) => value)).toEqual([SECRET, '', SECRET]);
    expect(screen.getByRole('status').textContent).toMatch(/^Copied/);
    click('Hide seed');
    expect(writeText.mock.calls.map(([value]) => value)).toEqual([SECRET, '', SECRET, '']);
  });

  it('an older successful clear cannot cancel the retry needed by a newer refused clear', async () => {
    setup();
    await copyBackup();
    let finishFirstClear!: () => void;
    writeText.mockImplementationOnce(() => new Promise<void>((resolve) => { finishFirstClear = resolve; }));
    click('Hide seed');
    await copyBackup();
    writeText.mockImplementationOnce(refused);
    click('Hide seed');
    await settle();
    finishFirstClear();
    await settle();
    const beforeRetry = writeText.mock.calls.length;
    fireEvent.click(document.body);
    expect(writeText).toHaveBeenCalledTimes(beforeRetry + 1);
    expect(writeText).toHaveBeenLastCalledWith('');
  });

  it('an older failed clear cannot schedule an unexpected clear of a newer copy', async () => {
    setup();
    await copyBackup();
    let rejectFirstClear!: (reason: Error) => void;
    writeText.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectFirstClear = reject; }));
    click('Hide seed');
    await copyBackup();
    rejectFirstClear(new Error('first clear refused'));
    await settle();
    const beforeClick = writeText.mock.calls.length;
    fireEvent.click(document.body);
    expect(writeText).toHaveBeenCalledTimes(beforeClick);
    click('Hide seed');
    expect(writeText).toHaveBeenCalledTimes(beforeClick + 1);
  });

  it('restores an earlier cleanup request if both its pending clear and the replacement copy fail', async () => {
    setup();
    await copyBackup();
    let rejectClear!: (reason: Error) => void;
    writeText.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectClear = reject; }));
    click('Hide seed');
    let rejectCopy!: (reason: Error) => void;
    writeText.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectCopy = reject; }));
    click('Show backup seed');
    click('Copy seed');
    click('Copy anyway');
    rejectClear(new Error('earlier clear refused'));
    await settle();
    rejectCopy(new Error('replacement copy refused'));
    await settle();
    const beforeRetry = writeText.mock.calls.length;
    fireEvent.click(document.body);
    expect(writeText).toHaveBeenCalledTimes(beforeRetry + 1);
    expect(writeText).toHaveBeenLastCalledWith('');
  });

  it('auto-hide clears a copied backup and app lock also hides a still-mounted reveal', async () => {
    vi.useFakeTimers();
    setup();
    await copyBackup();
    act(() => { vi.advanceTimersByTime(BACKUP_VISIBLE_MS); });
    expect(screen.queryByText(SECRET)).toBeNull();
    expect(writeText).toHaveBeenLastCalledWith('');
    await settle();
    click('Show backup seed');
    expect(screen.getByText(SECRET)).toBeTruthy();
    act(() => { notifyAppLock('idle'); });
    expect(screen.queryByText(SECRET)).toBeNull();
  });

  it('attempts cleanup again when an unmounted copy completes after its first clear', async () => {
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
    expect(writeText.mock.calls.map(([value]) => value)).toEqual([SECRET, '', '']);
  });
});
