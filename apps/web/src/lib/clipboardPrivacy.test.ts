import { afterEach, describe, expect, it, vi } from 'vitest';
import { recordClipboardCopy, type ClipboardPort } from './clipboardPrivacy';

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
    for (const delay of [0, -1, NaN, Infinity, 0.5, 5 * 60_000 + 1]) recordClipboardCopy('private', c.port, delay);
    await vi.runAllTimersAsync();
    expect(c.read).not.toHaveBeenCalled();
    expect(c.write).not.toHaveBeenCalled();
  });

  it('clears matching content only after the configured interval', async () => {
    vi.useFakeTimers();
    const c = fakeClipboard('private');
    recordClipboardCopy('private', c.port, 30_000);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(c.read).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(c.read).toHaveBeenCalledTimes(2);
    expect(c.write).toHaveBeenCalledExactlyOnceWith('');
    expect(c.value()).toBe('');
  });

  it('never overwrites a newer external clipboard value', async () => {
    vi.useFakeTimers();
    const c = fakeClipboard('private');
    recordClipboardCopy('private', c.port, 30_000);
    c.overwrite('new text from another app');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(c.read).toHaveBeenCalledOnce();
    expect(c.write).not.toHaveBeenCalled();
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
      writeText: vi.fn(() => Promise.reject(new Error('Must not overwrite newer clipboard content'))),
    } satisfies ClipboardPort;
    recordClipboardCopy('private', port, 30_000);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(reads).toBe(2);
    expect(port.writeText).not.toHaveBeenCalled();
  });

  it('supersedes older timers, even when the user recopies the same text', async () => {
    vi.useFakeTimers();
    const c = fakeClipboard('private');
    recordClipboardCopy('private', c.port, 30_000);
    await vi.advanceTimersByTimeAsync(10_000);
    recordClipboardCopy('private', c.port, 30_000);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(c.read).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(c.write).toHaveBeenCalledExactlyOnceWith('');
  });

  it('does not clear after a newer copy arrives while clipboard reading is pending', async () => {
    vi.useFakeTimers();
    let resolveRead: ((value: string) => void) | undefined;
    const readText = vi.fn(() => new Promise<string>((resolve) => { resolveRead = resolve; }));
    const writeText = vi.fn(() => Promise.resolve());
    const port: ClipboardPort = { readText, writeText };
    recordClipboardCopy('older', port, 30_000);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(readText).toHaveBeenCalledOnce();
    recordClipboardCopy('newer', port, 30_000);
    if (!resolveRead) throw new Error('Expected pending clipboard read');
    resolveRead('older');
    await Promise.resolve();
    await Promise.resolve();
    expect(writeText).not.toHaveBeenCalled();
  });

  it('fails quietly when clipboard read or clear permissions are denied', async () => {
    vi.useFakeTimers();
    const readDenied = {
      readText: vi.fn(() => Promise.reject(new Error('permission denied'))),
      writeText: vi.fn(() => Promise.resolve()),
    } satisfies ClipboardPort;
    recordClipboardCopy('private', readDenied, 30_000);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(readDenied.writeText).not.toHaveBeenCalled();

    const writeDenied = {
      readText: vi.fn(() => Promise.resolve('private')),
      writeText: vi.fn(() => Promise.reject(new Error('permission denied'))),
    } satisfies ClipboardPort;
    recordClipboardCopy('private', writeDenied, 30_000);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(writeDenied.writeText).toHaveBeenCalledExactlyOnceWith('');
  });
});
