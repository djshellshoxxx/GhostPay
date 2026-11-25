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
let nativeWrite: Promise<void> | undefined;

/**
 * A confirmed wallet backup that may still be on the clipboard. Only its length and digest are kept. Hide, Lock,
 * leaving its view and the app lock remove it whatever the timer preference, but only while the clipboard still
 * holds exactly this text.
 */
interface RecoveryCopy {
  readonly generation: number;
  readonly clipboard: ClipboardPort;
  readonly length: number;
  readonly digest: string;
  /** The automatic retry at the next click or key press runs once, so a browser paste prompt cannot repeat on every click. */
  activationRetried: boolean;
}
let recovery: RecoveryCopy | undefined;
let recoveryCheck: { readonly entry: RecoveryCopy; readonly done: Promise<void> } | undefined;
/** A check that met a newer pending app write; that write's failure repeats the check. */
let recoveryRecheck: RecoveryCopy | undefined;
let recoveryUnverified = false;
const recoveryListeners = new Set<() => void>();

/** Keep the actual clipboard effects in order, including browsers that apply a write just before it settles. */
async function writeText(clipboard: ClipboardPort, text: string): Promise<void> {
  const write = clipboard.writeText(text);
  nativeWrite = write;
  try { await write; }
  finally { if (nativeWrite === write) nativeWrite = undefined; }
}

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

function hasNewerPending(generation: number): boolean {
  for (const pending of pendingWrites) if (pending > generation) return true;
  return false;
}

type ClearOutcome = 'cleared' | 'changed' | 'superseded' | 'unverified';

/**
 * Empty the clipboard only while it still holds exactly the copied text as its single plain-text item. `allowed` is
 * rechecked around every await. A denied or missing read, or a refused write, reports `unverified` and changes nothing.
 */
async function clearIfStillCopied(clipboard: ClipboardPort, length: number, digest: string, allowed: () => boolean): Promise<ClearOutcome> {
  const matches = (text: string): boolean => text.length === length && fingerprint(text) === digest;
  try {
    if (!allowed()) return 'superseded';
    if (!matches(await clipboard.readText())) return 'changed';
    if (!allowed()) return 'superseded';
    // A replacement may have the same plain text plus an image or HTML representation.
    if (clipboard.read) {
      const items = await clipboard.read();
      const types = items[0]?.types;
      if (items.length !== 1 || types?.length !== 1 || types[0] !== 'text/plain') return 'changed';
      if (!allowed()) return 'superseded';
    }
    if (!matches(await clipboard.readText())) return 'changed';
    if (!allowed()) return 'superseded';
    await writeText(clipboard, '');
    return 'cleared';
  } catch {
    return 'unverified';
  }
}

function setRecoveryUnverified(next: boolean): void {
  if (recoveryUnverified === next) return;
  recoveryUnverified = next;
  for (const listener of [...recoveryListeners]) listener();
}

function onActivation(): void {
  armActivationRetry(false);
  const entry = recovery;
  if (entry === undefined) return;
  entry.activationRetried = true;
  void clearCopiedRecovery();
}

/**
 * Capture phase, before the page's own handlers: a click that copies again starts its write after this check has
 * started, so the check sees that newer write pending and leaves it alone.
 */
function armActivationRetry(on: boolean): void {
  if (typeof window === 'undefined') return;
  for (const type of ['click', 'keydown'] as const) {
    if (on) window.addEventListener(type, onActivation, true);
    else window.removeEventListener(type, onActivation, true);
  }
}

function settleRecovery(next: RecoveryCopy | undefined): void {
  recovery = next;
  recoveryRecheck = undefined;
  armActivationRetry(false);
  setRecoveryUnverified(false);
}

function recoveryAllowed(entry: RecoveryCopy): boolean {
  if (recovery !== entry) return false;
  if (hasNewerPending(entry.generation)) {
    recoveryRecheck = entry;
    return false;
  }
  return true;
}

function runRecoveryCheck(entry: RecoveryCopy): Promise<void> {
  const slot: { entry: RecoveryCopy; done: Promise<void> } = { entry, done: Promise.resolve() };
  slot.done = (async () => {
    try {
      const outcome = await clearIfStillCopied(entry.clipboard, entry.length, entry.digest, () => recoveryAllowed(entry));
      if (recovery !== entry) return;
      if (outcome === 'cleared' || outcome === 'changed') {
        // Cleared, or the clipboard holds something else now: nothing of this backup is left for GhostPay to remove.
        if (latestSuccessfulCopy === entry.generation) { clearTimeout(timer); timer = undefined; }
        settleRecovery(undefined);
      } else if (outcome === 'unverified') {
        setRecoveryUnverified(true);
        armActivationRetry(!entry.activationRetried);
      }
      // 'superseded': a newer app write is pending. Its success replaces the backup; its failure repeats this check.
    } finally {
      if (recoveryCheck === slot) recoveryCheck = undefined;
    }
  })();
  recoveryCheck = slot;
  return slot.done;
}

/**
 * Hide, automatic hiding, Lock, leaving the view and the app lock call this. It empties the clipboard only while it
 * still holds the copied backup, and leaves newer or different content alone. When the browser refuses to let the page
 * read or write the clipboard, {@link copiedRecoveryUnverified} turns true and one retry waits for the next click or key
 * press in this page.
 */
export function clearCopiedRecovery(): Promise<void> {
  const entry = recovery;
  if (entry === undefined) return Promise.resolve();
  if (recoveryCheck?.entry === entry) return recoveryCheck.done;
  return runRecoveryCheck(entry);
}

/** True while a copied backup may still be on the clipboard because the browser refused the check or the clear. */
export function copiedRecoveryUnverified(): boolean {
  return recoveryUnverified;
}

export function subscribeCopiedRecovery(listener: () => void): () => void {
  recoveryListeners.add(listener);
  return () => { recoveryListeners.delete(listener); };
}

/**
 * Only for an explicit user request after a check could not be done: writes an empty clipboard without reading it, so
 * it also removes anything copied after the backup. Never called automatically.
 * @returns Whether the browser accepted the write.
 */
export async function emptyClipboardOnRequest(): Promise<boolean> {
  const entry = recovery;
  if (entry === undefined) return true;
  try {
    await writeText(entry.clipboard, '');
  } catch {
    return false;
  }
  if (recovery === entry) {
    if (latestSuccessfulCopy === entry.generation) { clearTimeout(timer); timer = undefined; }
    settleRecovery(undefined);
  }
  return true;
}

export async function copyClipboardText(
  value: string, clipboard: ClipboardPort, clearAfterMs = 0, current: () => boolean = () => true,
  options: { readonly recovery?: boolean } = {},
): Promise<void> {
  const generation = ++nextCopy;
  const copyRevision = revision;
  pendingWrites.add(generation);
  try {
    // A native copy or clear cannot be withdrawn. Only dispatch the latest still-mounted queued request.
    if (nativeWrite) {
      await nativeWrite.catch(() => undefined);
      if (generation !== nextCopy || !current()) throw new Error('Copy is no longer current.');
    }
    await writeText(clipboard, value);
    if (generation < latestSuccessfulCopy) return;
    latestSuccessfulCopy = generation;
    clearTimeout(timer);
    timer = undefined;
    deferredCleanup = undefined;
    const digest = value ? fingerprint(value) : '';
    // The newest successful copy replaced whatever was there: only a backup it wrote itself remains tracked.
    const entry = options.recovery === true && value ? { generation, clipboard, length: value.length, digest, activationRetried: false } : undefined;
    settleRecovery(entry);
    const timed = copyRevision === revision && value !== '' && Number.isSafeInteger(clearAfterMs) && clearAfterMs >= 1_000 && clearAfterMs <= MAX_CLIPBOARD_CLEAR_MS;
    if (entry === undefined) {
      if (timed) scheduleCleanup(generation, copyRevision, clipboard, clearAfterMs, value.length, digest);
      return;
    }
    if (timed) timer = setTimeout(() => { timer = undefined; if (recovery === entry) void runRecoveryCheck(entry); }, clearAfterMs);
    // Hidden, locked or left while this write was pending: check this late copy, never a newer one.
    if (!current()) void runRecoveryCheck(entry);
  } finally {
    pendingWrites.delete(generation);
    const retry = deferredCleanup;
    deferredCleanup = undefined;
    void retry?.();
    const recheck = recoveryRecheck;
    if (recheck !== undefined && recheck === recovery && !hasNewerPending(recheck.generation)) {
      recoveryRecheck = undefined;
      void runRecoveryCheck(recheck);
    }
  }
}

function scheduleCleanup(generation: number, copyRevision: number, clipboard: ClipboardPort, delay: number, length: number, digest: string): void {
  function canClear(): boolean {
    if (copyRevision !== revision || generation !== latestSuccessfulCopy) return false;
    if (hasNewerPending(generation)) {
      // A success supersedes this timer. A rejection retries it and rechecks the actual text.
      deferredCleanup = clearIfUnchanged;
      return false;
    }
    return true;
  }

  async function clearIfUnchanged(): Promise<void> {
    // Denied or unavailable clipboard access leaves the user's copy alone.
    await clearIfStillCopied(clipboard, length, digest, canClear);
  }

  timer = setTimeout(() => { timer = undefined; void clearIfUnchanged(); }, delay);
}
