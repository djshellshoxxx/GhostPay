import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

/** Optional, best-effort cleanup. Web Clipboard API read+write is not an atomic compare-and-swap. */
export interface ClipboardPort {
  readonly readText: () => Promise<string>;
  readonly writeText: (text: string) => Promise<void>;
}

export interface ClipboardCopyIntent {
  readonly id: number;
  readonly cleanupRevision: number;
}

export const MAX_CLIPBOARD_CLEAR_MS = 5 * 60_000;
let latestCopy = 0;
let cleanupRevision = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let pendingClear: Promise<void> | undefined;

function cancelTimer(): void {
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
}

/** Reserve ownership before dispatching a write, so its late completion cannot supersede a newer copy. */
export function beginClipboardCopy(): ClipboardCopyIntent {
  cancelTimer();
  return { id: ++latestCopy, cleanupRevision };
}

export function isCurrentClipboardCopy(intent: ClipboardCopyIntent): boolean {
  return intent.id === latestCopy;
}

/** Cancels timers and pending comparisons; an already-dispatched browser write cannot be cancelled. */
export function cancelClipboardCleanup(): void {
  cleanupRevision += 1;
  cancelTimer();
}

/** Do not let an already-dispatched cleanup finish after a newer app copy. Normal copies retain user activation. */
export function writeClipboardText(value: string, clipboard: ClipboardPort): Promise<void> {
  if (pendingClear === undefined) return clipboard.writeText(value);
  return pendingClear.catch(() => undefined).then(() => writeClipboardText(value, clipboard));
}

/** Retain a digest, not the copied backup or payment text, while a timer or activation retry waits. */
export function clipboardValueMatches(value: string): (candidate: string) => boolean {
  const digest = bytesToHex(sha256(utf8ToBytes(value)));
  return (candidate) => bytesToHex(sha256(utf8ToBytes(candidate))) === digest;
}

export type ClipboardClearResult = 'cleared' | 'changed' | 'superseded' | 'denied';

/** A denied/missing read never falls back to an unconditional write. External compare/write races remain possible. */
export async function clearClipboardIfUnchanged(matches: (value: string) => boolean, clipboard: ClipboardPort, current: () => boolean): Promise<ClipboardClearResult> {
  if (!current()) return 'superseded';
  try {
    if (!matches(await clipboard.readText())) return 'changed';
    if (!current()) return 'superseded';
    // A delayed read can return a stale snapshot. Recheck immediately before the guarded write.
    if (!matches(await clipboard.readText())) return 'changed';
    if (!current()) return 'superseded';
    // Another cleanup can have reached its write while these reads were pending.
    if (pendingClear !== undefined) {
      await pendingClear;
      return clearClipboardIfUnchanged(matches, clipboard, current);
    }
    const clear = clipboard.writeText('');
    pendingClear = clear;
    try { await clear; }
    finally { if (pendingClear === clear) pendingClear = undefined; }
    return 'cleared';
  } catch {
    return 'denied';
  }
}

/**
 * Records a successful user copy. Delays outside 1 s through 5 min disable cleanup. A caller that writes
 * asynchronously must pass the intent reserved before that write; cancelled settings cannot rearm it later.
 */
export function recordClipboardCopy(value: string, clipboard: ClipboardPort, clearAfterMs = 0, intent = beginClipboardCopy()): void {
  if (!isCurrentClipboardCopy(intent) || intent.cleanupRevision !== cleanupRevision) return;
  if (!Number.isSafeInteger(clearAfterMs) || clearAfterMs < 1_000 || clearAfterMs > MAX_CLIPBOARD_CLEAR_MS) return;
  const matches = clipboardValueMatches(value);
  timer = setTimeout(() => {
    timer = undefined;
    void clearClipboardIfUnchanged(matches, clipboard, () => isCurrentClipboardCopy(intent) && intent.cleanupRevision === cleanupRevision);
  }, clearAfterMs);
}
