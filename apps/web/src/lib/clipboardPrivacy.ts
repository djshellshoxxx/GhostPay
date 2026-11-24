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
let nextCopy = 0;
let latestSuccessfulCopy = 0;
const pendingWrites = new Set<number>();
let deferredCleanup: (() => Promise<void>) | undefined;

/** Track the native write from the click, since its value can become visible before its promise settles. */
export async function copyClipboardText(value: string, clipboard: ClipboardPort, clearAfterMs = 0): Promise<void> {
  const generation = ++nextCopy;
  pendingWrites.add(generation);
  try {
    await clipboard.writeText(value);
    scheduleCleanup(generation, value, clipboard, clearAfterMs);
  } finally {
    pendingWrites.delete(generation);
    const retry = deferredCleanup;
    deferredCleanup = undefined;
    void retry?.();
  }
}

/**
 * Called after an actual, successful user-initiated clipboard write.
 * Delays under one second, nonintegers and values over five minutes disable automatic cleanup.
 * This does not promise sensitive strings have been zeroized from JavaScript memory or OS clipboard history.
 */
export function recordClipboardCopy(value: string, clipboard: ClipboardPort, clearAfterMs = 0): void {
  scheduleCleanup(++nextCopy, value, clipboard, clearAfterMs);
}

function scheduleCleanup(generation: number, value: string, clipboard: ClipboardPort, clearAfterMs: number): void {
  if (generation < latestSuccessfulCopy) return;
  latestSuccessfulCopy = generation;
  deferredCleanup = undefined;
  if (!Number.isSafeInteger(clearAfterMs) || clearAfterMs < 1_000 || clearAfterMs > MAX_CLIPBOARD_CLEAR_MS) return;

  function canClear(): boolean {
    if (generation !== latestSuccessfulCopy) return false;
    for (const pending of pendingWrites) {
      if (pending > generation) {
        // A success supersedes this timer. A rejection retries it and rechecks the actual text.
        deferredCleanup = clearIfUnchanged;
        return false;
      }
    }
    return true;
  }

  async function clearIfUnchanged(): Promise<void> {
    try {
      if (!canClear() || await clipboard.readText() !== value || !canClear()) return;
      // A read may have resolved with a stale snapshot. Recheck before the non-atomic clipboard write.
      if (await clipboard.readText() !== value || !canClear()) return;
      await clipboard.writeText('');
    } catch {
      // If the browser denies reading or clearing, leave the clipboard alone.
    }
  }
  setTimeout(() => { void clearIfUnchanged(); }, clearAfterMs);
}
