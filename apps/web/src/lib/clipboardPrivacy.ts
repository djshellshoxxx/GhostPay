/**
 * Clipboard cleanup is optional and best-effort. Browser permissions can deny reading or clearing, and clipboard
 * read+write is not an atomic compare-and-swap against other applications. Never clear a value we observed changing.
 * A new successful app copy invalidates earlier timers, including when copying the same value twice.
 */
export interface ClipboardPort {
  readText(): Promise<string>;
  writeText(text: string): Promise<void>;
}

export const MAX_CLIPBOARD_CLEAR_MS = 5 * 60_000;
let latestCopy = 0;

/**
 * Called after an actual, successful user-initiated clipboard write.
 * Delays under one second, nonintegers and values over five minutes disable automatic cleanup.
 * This does not promise sensitive strings have been zeroized from JavaScript memory or OS clipboard history.
 */
export function recordClipboardCopy(value: string, clipboard: ClipboardPort, clearAfterMs = 0): void {
  const generation = ++latestCopy;
  if (!Number.isSafeInteger(clearAfterMs) || clearAfterMs < 1_000 || clearAfterMs > MAX_CLIPBOARD_CLEAR_MS) return;

  setTimeout(() => {
    if (generation !== latestCopy) return;
    void (async () => {
      try {
        // Permission may be denied or API unavailable: never unconditionally overwrite clipboard contents.
        if (await clipboard.readText() !== value || generation !== latestCopy) return;
        // A read may have resolved with a stale snapshot while another application changed the clipboard.
        // A second read narrows (but cannot eliminate) the Web Clipboard API compare/write race.
        if (await clipboard.readText() !== value || generation !== latestCopy) return;
        await clipboard.writeText('');
      } catch {
        // The app cannot safely clear a clipboard without permission; leave it untouched.
      }
    })();
  }, clearAfterMs);
}
