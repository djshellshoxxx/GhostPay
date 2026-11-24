import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyClipboardText, type ClipboardPort } from './clipboardPrivacy';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

function fakeClipboard(initial = ''): { port: ClipboardPort; value: () => string; overwrite: (next: string) => void; write: ReturnType<typeof vi.fn>; read: ReturnType<typeof vi.fn> } {
  let value = initial;
  const read = vi.fn(() => Promise.resolve(value));
  const write = vi.fn((next: string) => { value = next; return Promise.resolve(); });
  return { port: { readText: read, writeText: write }, value: () => value, overwrite: (next) => { value = next; }, write, read };
}

describe('opt-in clipboard cleanup', () => {
  it('does not read or clear the clipboard when disabled or given an invalid delay', async () => {
    vi.useFakeTimers();
    const c = fakeClipboard('private');
    const delays = [0, -1, NaN, Infinity, 0.5, 5 * 60_000 + 1];
    for (const delay of delays) await copyClipboardText('private', c.port, delay);
    await vi.runAllTimersAsync();
    expect(c.read).not.toHaveBeenCalled();
    expect(c.write.mock.calls).toEqual(delays.map(() => ['private']));
  });

  it('clears matching content only after the configured interval', async () => {
    vi.useFakeTimers();
    const c = fakeClipboard('private');
    await copyClipboardText('private', c.port, 30_000);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(c.read).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(c.read).toHaveBeenCalledTimes(2);
    expect(c.write.mock.calls).toEqual([['private'], ['']]);
    expect(c.value()).toBe('');
  });

  it('never overwrites a newer external clipboard value', async () => {
    vi.useFakeTimers();
    const c = fakeClipboard('private');
    await copyClipboardText('private', c.port, 30_000);
    c.overwrite('new text from another app');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(c.read).toHaveBeenCalledOnce();
    expect(c.write).toHaveBeenCalledExactlyOnceWith('private');
    expect(c.value()).toBe('new text from another app');
  });

  it('rechecks after a stale asynchronous read before clearing a newer clipboard value', async () => {
    vi.useFakeTimers();
    let value = 'private';
    let reads = 0;
    const port = {
      readText: vi.fn(() => {
        reads += 1;
        if (reads === 1) { value = 'newer external text'; return Promise.resolve('private'); }
        return Promise.resolve(value);
      }),
      writeText: vi.fn<ClipboardPort['writeText']>().mockResolvedValueOnce(undefined).mockRejectedValue(new Error('Must not overwrite newer clipboard content')),
    } satisfies ClipboardPort;
    await copyClipboardText('private', port, 30_000);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(reads).toBe(2);
    expect(port.writeText).toHaveBeenCalledExactlyOnceWith('private');
  });

  it('supersedes older timers, even when the user recopies the same text', async () => {
    vi.useFakeTimers();
    const c = fakeClipboard('private');
    await copyClipboardText('private', c.port, 30_000);
    await vi.advanceTimersByTimeAsync(10_000);
    await copyClipboardText('private', c.port, 30_000);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(c.read).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(c.write.mock.calls).toEqual([['private'], ['private'], ['']]);
  });

  it('does not clear after a newer copy arrives while clipboard reading is pending', async () => {
    vi.useFakeTimers();
    let resolveRead: ((value: string) => void) | undefined;
    const readText = vi.fn(() => new Promise<string>((resolve) => { resolveRead = resolve; }));
    const writeText = vi.fn(() => Promise.resolve());
    const port: ClipboardPort = { readText, writeText };
    await copyClipboardText('older', port, 30_000);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(readText).toHaveBeenCalledOnce();
    await copyClipboardText('newer', port, 30_000);
    if (!resolveRead) throw new Error('Expected pending clipboard read');
    resolveRead('older');
    await Promise.resolve();
    await Promise.resolve();
    expect(writeText.mock.calls).toEqual([['older'], ['newer']]);
  });

  it('fails quietly when clipboard read or clear permissions are denied', async () => {
    vi.useFakeTimers();
    const readDenied = {
      readText: vi.fn(() => Promise.reject(new Error('permission denied'))),
      writeText: vi.fn(() => Promise.resolve()),
    } satisfies ClipboardPort;
    await copyClipboardText('private', readDenied, 30_000);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(readDenied.writeText).toHaveBeenCalledExactlyOnceWith('private');

    const writeDenied = {
      readText: vi.fn(() => Promise.resolve('private')),
      writeText: vi.fn<ClipboardPort['writeText']>().mockResolvedValueOnce(undefined).mockRejectedValue(new Error('permission denied')),
    } satisfies ClipboardPort;
    await copyClipboardText('private', writeDenied, 30_000);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(writeDenied.writeText.mock.calls).toEqual([['private'], ['']]);
  });
});
