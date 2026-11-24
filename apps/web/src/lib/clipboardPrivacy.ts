import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

/** Browser read and write are separate operations. Check the text immediately before requesting a clear. */
export interface ClipboardPort {
  readText(): Promise<string>;
  read?(): Promise<ReadonlyArray<Pick<ClipboardItem, 'types'>>>;
  writeText(text: string): Promise<void>;
}

export const MAX_CLIPBOARD_CLEAR_MS = 5 * 60_000;
let nextCopy = 0;
let latestSuccessfulCopy = 0;
const pendingWrites = new Set<number>();
let deferredCleanup: (() => Promise<void>) | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let revision = 0;
let pendingClear: Promise<void> | undefined;

/** A saved preference change also revokes pending reads and timers from copies that have yet to settle. */
export function cancelClipboardCleanup(): void {
  ++revision;
  clearTimeout(timer);
  timer = undefined;
  deferredCleanup = undefined;
}

/** Hash exact UTF-16 code units, including lone surrogates, without retaining recovery text in a timer. */
function fingerprint(text: string): string {
  const units = new Uint16Array(text.length);
  for (let i = 0; i < text.length; i++) units[i] = text.charCodeAt(i);
  try {
    return bytesToHex(sha256(new Uint8Array(units.buffer)));
  } finally {
    units.fill(0);
  }
}

export async function copyClipboardText(
  value: string, clipboard: ClipboardPort, clearAfterMs = 0, current: () => boolean = () => true,
): Promise<void> {
  const generation = ++nextCopy;
  const copyRevision = revision;
  pendingWrites.add(generation);
  try {
    // A native clear cannot be withdrawn. Let it finish before dispatching the newer copy.
    if (pendingClear) {
      await pendingClear.catch(() => undefined);
      if (generation !== nextCopy || !current()) throw new Error('Copy is no longer current.');
    }
    await clipboard.writeText(value);
    if (generation < latestSuccessfulCopy) return;
    latestSuccessfulCopy = generation;
    clearTimeout(timer);
    timer = undefined;
    deferredCleanup = undefined;
    if (copyRevision !== revision || !value || !Number.isSafeInteger(clearAfterMs) || clearAfterMs < 1_000 || clearAfterMs > MAX_CLIPBOARD_CLEAR_MS) return;
    scheduleCleanup(generation, copyRevision, clipboard, clearAfterMs, value.length, fingerprint(value));
  } finally {
    pendingWrites.delete(generation);
    const retry = deferredCleanup;
    deferredCleanup = undefined;
    void retry?.();
  }
}

function scheduleCleanup(generation: number, copyRevision: number, clipboard: ClipboardPort, delay: number, length: number, digest: string): void {
  const matches = (text: string): boolean => text.length === length && fingerprint(text) === digest;
  function canClear(): boolean {
    if (copyRevision !== revision || generation !== latestSuccessfulCopy) return false;
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
      if (!canClear() || !matches(await clipboard.readText()) || !canClear()) return;
      // A replacement may have the same plain text plus an image or HTML representation.
      if (clipboard.read) {
        const items = await clipboard.read();
        const types = items[0]?.types;
        if (items.length !== 1 || types?.length !== 1 || types[0] !== 'text/plain' || !canClear()) return;
      }
      if (!matches(await clipboard.readText()) || !canClear()) return;
      const clear = clipboard.writeText('');
      pendingClear = clear;
      try { await clear; }
      finally { if (pendingClear === clear) pendingClear = undefined; }
    } catch {
      // Denied or unavailable clipboard access leaves the user's copy alone.
    }
  }

  timer = setTimeout(() => { timer = undefined; void clearIfUnchanged(); }, delay);
}
