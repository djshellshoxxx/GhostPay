// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notifyAppLock } from '../lib/appLock';
import { emptyClipboardOnRequest } from '../lib/clipboardPrivacy';
import { BACKUP_VISIBLE_MS, CopiedBackupNotice, englishBackupText, SecretBackup } from './SecretBackup';

const SECRET = 'ab'.repeat(32);
/** The system clipboard as the stub sees it: a refused write leaves it unchanged. */
let clipboardText = '';
const writeText = vi.fn<(text: string) => Promise<void>>();
const readText = vi.fn<() => Promise<string>>();
let visibility: DocumentVisibilityState = 'visible';

function setup() {
  const reveal = vi.fn(() => SECRET);
  render(<><CopiedBackupNotice /><SecretBackup reveal={reveal} text={englishBackupText('seed')} /></>);
  return { reveal };
}

const click = (name: string): void => {
  fireEvent.click(screen.getByRole('button', { name }));
};

/** Lets pending clipboard promises settle, including the checks that read the clipboard before clearing it. */
async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

/** Clicks and lets the clipboard promises settle. */
async function clickAndSettle(name: string): Promise<void> {
  click(name);
  await settle();
}

/** Shows the backup and copies it, confirmed. */
async function copyBackup(): Promise<void> {
  click('Show backup seed');
  click('Copy seed');
  await clickAndSettle('Copy anyway');
  expect(screen.getByRole('status').textContent).toMatch(/Copied/);
}

const written = (): string[] => writeText.mock.calls.map(([value]) => value);
const NOTICE = 'A copied backup may still be on the clipboard';

describe('SecretBackup', () => {
  beforeEach(() => {
    clipboardText = '';
    writeText.mockReset();
    writeText.mockImplementation((text) => { clipboardText = text; return Promise.resolve(); });
    readText.mockReset();
    readText.mockImplementation(() => Promise.resolve(clipboardText));
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText, readText } });
    visibility = 'visible';
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  });
  afterEach(async () => {
    cleanup();
    vi.useRealTimers();
    // Forget a tracked backup left by a test, so the module state does not leak into the next one.
    writeText.mockImplementation(() => Promise.resolve());
    await emptyClipboardOnRequest();
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
    // Nothing was copied, so Hide neither reads nor writes the clipboard.
    expect(writeText).not.toHaveBeenCalled();
    expect(readText).not.toHaveBeenCalled();
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

  it('copies only after a warned second click, and Hide empties the clipboard while it still holds the backup', async () => {
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
    expect(written()).toEqual([SECRET]);
    expect(screen.getByRole('status').textContent).toMatch(/Copied/);
    await clickAndSettle('Hide seed');
    expect(screen.queryByText(SECRET)).toBeNull();
    expect(written()).toEqual([SECRET, '']);
    expect(clipboardText).toBe('');
  });

  it('Hide leaves text copied after the backup alone', async () => {
    setup();
    await copyBackup();
    clipboardText = 'copied later in another application';
    await clickAndSettle('Hide seed');
    expect(clipboardText).toBe('copied later in another application');
    expect(written()).toEqual([SECRET]);
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it('reports a failed copy and then leaves the clipboard alone', async () => {
    writeText.mockRejectedValueOnce(new Error('denied'));
    setup();
    click('Show backup seed');
    click('Copy seed');
    await clickAndSettle('Copy anyway');
    expect(screen.getByRole('status').textContent).toMatch(/Copy failed: select the text manually/);
    await clickAndSettle('Hide seed');
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(readText).not.toHaveBeenCalled();
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

  it('ignores a stale successful copy after Hide and a new reveal, and empties the late write while unchanged', async () => {
    let finishCopy!: () => void;
    writeText.mockImplementationOnce((text) => new Promise<void>((resolve) => { finishCopy = () => { clipboardText = text; resolve(); }; }));
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
    expect(written()).toEqual([SECRET, '']);
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
    expect(written()).toEqual([SECRET]);
  });

  it('prevents duplicate confirmations while a copy is pending and keeps Hide available', async () => {
    let finishCopy!: () => void;
    writeText.mockImplementationOnce((text) => new Promise<void>((resolve) => { finishCopy = () => { clipboardText = text; resolve(); }; }));
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
    writeText.mockImplementationOnce((text) => new Promise<void>((resolve) => { finishFirst = () => { clipboardText = text; resolve(); }; }));
    setup();
    click('Show backup seed');
    click('Copy seed');
    click('Copy anyway');
    click('Hide seed');
    await settle();
    click('Show backup seed');
    click('Copy seed');
    await clickAndSettle('Copy anyway');
    expect(writeText).toHaveBeenCalledOnce();
    finishFirst();
    await settle();
    expect(written()).toEqual([SECRET, SECRET]);
    expect(screen.getByRole('status').textContent).toMatch(/^Copied/);
    await clickAndSettle('Hide seed');
    expect(written()).toEqual([SECRET, SECRET, '']);
  });

  it('auto-hide empties an unchanged copy, and the app lock hides a still-mounted reveal', async () => {
    vi.useFakeTimers();
    setup();
    await copyBackup();
    act(() => { vi.advanceTimersByTime(BACKUP_VISIBLE_MS); });
    await settle();
    expect(screen.queryByText(SECRET)).toBeNull();
    expect(written()).toEqual([SECRET, '']);
    click('Show backup seed');
    expect(screen.getByText(SECRET)).toBeTruthy();
    act(() => { notifyAppLock('idle'); });
    expect(screen.queryByText(SECRET)).toBeNull();
  });

  it('the app lock empties an unchanged copied backup and leaves newer content alone', async () => {
    setup();
    await copyBackup();
    act(() => { notifyAppLock('idle'); });
    await settle();
    expect(clipboardText).toBe('');
    expect(written()).toEqual([SECRET, '']);

    await copyBackup();
    clipboardText = 'newer text';
    act(() => { notifyAppLock('manual'); });
    await settle();
    expect(clipboardText).toBe('newer text');
    expect(written()).toEqual([SECRET, '', SECRET]);
  });

  it('empties a pending copy that settles after its view was left', async () => {
    let finishCopy!: () => void;
    writeText.mockImplementationOnce((text) => new Promise<void>((resolve) => { finishCopy = () => { clipboardText = text; resolve(); }; }));
    setup();
    click('Show backup seed');
    click('Copy seed');
    click('Copy anyway');
    cleanup();
    await settle();
    finishCopy();
    await settle();
    expect(written()).toEqual([SECRET, '']);
    expect(clipboardText).toBe('');
  });

  it('says so when the browser refuses the check, retries once at the next click, and empties only on request', async () => {
    setup();
    await copyBackup();
    const denied = new DOMException('Document is not focused.', 'NotAllowedError');
    readText.mockRejectedValueOnce(denied).mockRejectedValueOnce(denied);
    // The idle lock runs without user activation.
    act(() => { notifyAppLock('idle'); });
    await settle();
    expect(clipboardText).toBe(SECRET);
    expect(screen.getByText(NOTICE)).toBeTruthy();
    expect(written()).toEqual([SECRET]);
    // The next click anywhere tries once more; the browser refuses again.
    fireEvent.click(document.body);
    await settle();
    expect(readText).toHaveBeenCalledTimes(2);
    expect(screen.getByText(NOTICE)).toBeTruthy();
    // No further automatic retries, so a browser paste prompt cannot repeat on every click.
    fireEvent.click(document.body);
    await settle();
    expect(readText).toHaveBeenCalledTimes(2);
    expect(clipboardText).toBe(SECRET);
    // Check again works once the browser allows it.
    await clickAndSettle('Check clipboard again');
    expect(clipboardText).toBe('');
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it('Empty clipboard is an explicit choice that also removes newer content, and reports a refusal', async () => {
    setup();
    await copyBackup();
    readText.mockRejectedValue(new Error('denied'));
    await clickAndSettle('Hide seed');
    expect(screen.getByText(NOTICE)).toBeTruthy();
    expect(screen.getByText(/including anything you copied after the backup/)).toBeTruthy();
    clipboardText = 'newer text';
    writeText.mockRejectedValueOnce(new Error('denied'));
    await clickAndSettle('Empty clipboard');
    expect(screen.getByRole('alert').textContent).toMatch(/did not let GhostPay change the clipboard/);
    expect(clipboardText).toBe('newer text');
    await clickAndSettle('Empty clipboard');
    expect(clipboardText).toBe('');
    expect(screen.queryByText(NOTICE)).toBeNull();
  });
});
