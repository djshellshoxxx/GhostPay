import { parseCompressedPoint } from '@ghostpay/core-crypto';
import { parseStrictJson } from '@ghostpay/invoice-schema';
import { hexToBytes } from '@noble/hashes/utils.js';
import { useSyncExternalStore } from 'react';

/** Optional local names and public invoice-signing keys only. Never invoice contents or private keys. */
export const INVOICE_SIGNER_PINS_KEY = 'ghostpay.invoiceSignerPins.v1';
const MAX_PINS = 50;
const MAX_LABEL_POINTS = 64;
const MAX_STORED_CHARS = 16_384;
const SIGNER = /^(?:02|03)[0-9a-f]{64}$/;
const UNSAFE_LABEL = /[\p{Cc}\p{Cf}\p{Cs}]/u;

export interface InvoiceSignerPin {
  readonly label: string;
  readonly signer: string;
}

export interface InvoiceSignerPinsSnapshot {
  readonly status: 'ready' | 'unavailable';
  readonly pins: readonly InvoiceSignerPin[];
  /** Local snapshot generation; changes whenever persisted state or availability changes. */
  readonly revision: number;
}

export interface InvoiceSignerPinChange {
  readonly label: string;
  /** null only when adding a new local identity; replacement/removal must name the displayed prior key. */
  readonly expectedSigner: string | null;
  /** null removes the selected identity. */
  readonly signer: string | null;
  /** Independently confirmed full new key, or the current key for removal. */
  readonly confirmation: string;
}

export type InvoiceSignerPinChangeResult = 'saved' | 'removed' | 'conflict' | 'invalid' | 'unavailable';
export type InvoiceSignerPinStorage = Pick<Storage, 'getItem' | 'setItem'>;
/** One nonwaiting exclusive origin transaction. Unavailable/contended locks refuse the mutation. */
export type InvoiceSignerPinLock = (name: string, action: () => InvoiceSignerPinChangeResult) => Promise<InvoiceSignerPinChangeResult>;

export interface InvoiceSignerPinStore {
  /** Rereads actual storage, including when a storage event has not yet been delivered. Stable while unchanged. */
  readonly getSnapshot: () => InvoiceSignerPinsSnapshot;
  readonly subscribe: (listener: () => void) => () => void;
  readonly refresh: () => void;
  readonly change: (change: InvoiceSignerPinChange, isCurrent?: () => boolean) => Promise<InvoiceSignerPinChangeResult>;
}

interface PinRecord {
  readonly v: 1;
  /** Retained even when pins are empty, so remove/readd cannot revive an older in-flight approval. */
  readonly revision: number;
  readonly pins: readonly InvoiceSignerPin[];
}

const EMPTY_PINS: readonly InvoiceSignerPin[] = Object.freeze([]);
const EMPTY_RECORD: PinRecord = { v: 1, revision: 0, pins: EMPTY_PINS };
const UNAVAILABLE = Symbol('unavailable');

function validSigner(value: string): boolean {
  if (!SIGNER.test(value)) return false;
  try { parseCompressedPoint(hexToBytes(value)); return true; } catch { return false; }
}

function normalizedLabel(value: string): string | undefined {
  if (value.length > 256 || UNSAFE_LABEL.test(value)) return undefined;
  const normalized = value.trim().normalize('NFC');
  return normalized.length > 0 && [...normalized].length <= MAX_LABEL_POINTS ? normalized : undefined;
}

function exactRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function parseRecord(text: string | null): PinRecord | undefined {
  if (text === null) return EMPTY_RECORD;
  if (text.length > MAX_STORED_CHARS) return undefined;
  try {
    const value: unknown = parseStrictJson(text);
    if (!exactRecord(value, ['v', 'revision', 'pins']) || value['v'] !== 1) return undefined;
    const revision = value['revision'];
    const rawPins = value['pins'];
    if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0 || revision >= Number.MAX_SAFE_INTEGER
      || !Array.isArray(rawPins) || rawPins.length > MAX_PINS) return undefined;
    const labels = new Set<string>();
    const pins: InvoiceSignerPin[] = [];
    for (const item of rawPins as unknown[]) {
      if (!exactRecord(item, ['label', 'signer'])) return undefined;
      const label = item['label'];
      const signer = item['signer'];
      if (typeof label !== 'string' || normalizedLabel(label) !== label || labels.has(label)
        || typeof signer !== 'string' || !validSigner(signer)) return undefined;
      labels.add(label);
      pins.push(Object.freeze({ label, signer }));
    }
    return { v: 1, revision, pins: Object.freeze(pins) };
  } catch { return undefined; }
}

function browserStorage(): InvoiceSignerPinStorage | undefined {
  try { return globalThis.localStorage; } catch { return undefined; }
}

function browserLock(): InvoiceSignerPinLock | undefined {
  try {
    const locks = globalThis.navigator.locks;
    if (typeof locks?.request !== 'function') return undefined;
    return (name, action) => locks.request(name, { mode: 'exclusive', ifAvailable: true }, (lock) => lock === null ? 'unavailable' : action());
  } catch { return undefined; }
}

/** Factory for isolated tests; the browser uses one shared instance below. No network capabilities. */
export function createInvoiceSignerPinStore(options: {
  readonly storage?: () => InvoiceSignerPinStorage | undefined;
  readonly lock?: () => InvoiceSignerPinLock | undefined;
  readonly eventTarget?: EventTarget;
} = {}): InvoiceSignerPinStore {
  const storageSource = options.storage ?? browserStorage;
  const lockSource = options.lock ?? browserLock;
  const events = options.eventTarget ?? (typeof window === 'undefined' ? undefined : window);
  const listeners = new Set<() => void>();
  let raw: string | null | typeof UNAVAILABLE | undefined;
  let snapshot: InvoiceSignerPinsSnapshot = Object.freeze({ status: 'unavailable', pins: EMPTY_PINS, revision: 0 });
  let notifiedRevision = 0;

  const getSnapshot = (): InvoiceSignerPinsSnapshot => {
    let nextRaw: string | null | typeof UNAVAILABLE;
    try {
      const storage = storageSource();
      nextRaw = storage === undefined ? UNAVAILABLE : storage.getItem(INVOICE_SIGNER_PINS_KEY);
    } catch { nextRaw = UNAVAILABLE; }
    if (nextRaw === raw) return snapshot;
    raw = nextRaw;
    const record = nextRaw === UNAVAILABLE ? undefined : parseRecord(nextRaw);
    snapshot = Object.freeze({ status: record === undefined ? 'unavailable' : 'ready', pins: record?.pins ?? EMPTY_PINS, revision: snapshot.revision + 1 });
    return snapshot;
  };

  const refresh = (): void => {
    const next = getSnapshot();
    // An asynchronous authority guard may already have read a newer snapshot. Still notify the UI when its
    // native storage event arrives; getSnapshot alone must not consume that notification.
    if (next.revision === notifiedRevision) return;
    notifiedRevision = next.revision;
    for (const listener of listeners) listener();
  };

  const onStorage = (event: Event): void => {
    const storageEvent = event as StorageEvent;
    if (storageEvent.key !== null && storageEvent.key !== INVOICE_SIGNER_PINS_KEY) return;
    try {
      if (storageEvent.storageArea !== null && storageEvent.storageArea !== storageSource()) return;
    } catch { /* refresh still fails closed */ }
    // event.newValue is not authority. A delayed or synthetic event must not install a stale key.
    refresh();
  };

  const subscribe = (listener: () => void): (() => void) => {
    if (listeners.size === 0) {
      notifiedRevision = getSnapshot().revision;
      events?.addEventListener('storage', onStorage);
      events?.addEventListener('focus', refresh);
    }
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        events?.removeEventListener('storage', onStorage);
        events?.removeEventListener('focus', refresh);
      }
    };
  };

  const change = async (requested: InvoiceSignerPinChange, isCurrent: () => boolean = () => true): Promise<InvoiceSignerPinChangeResult> => {
    const label = normalizedLabel(requested.label);
    const expected = requested.expectedSigner;
    const signer = requested.signer;
    if (label === undefined || (expected !== null && !validSigner(expected)) || (signer !== null && !validSigner(signer))
      || (expected === null && signer === null) || requested.confirmation.trim() !== (signer ?? expected)) return 'invalid';
    try {
      const storage = storageSource();
      const lock = lockSource();
      if (storage === undefined || lock === undefined) return 'unavailable';
      const result = await lock(INVOICE_SIGNER_PINS_KEY, () => {
        if (!isCurrent()) return 'conflict';
        const record = parseRecord(storage.getItem(INVOICE_SIGNER_PINS_KEY));
        if (record === undefined) return 'unavailable';
        const current = record.pins.find((pin) => pin.label === label);
        if ((current?.signer ?? null) !== expected) return 'conflict';
        if (signer !== null && current === undefined && record.pins.length >= MAX_PINS) return 'invalid';
        const pins = record.pins.filter((pin) => pin.label !== label);
        if (signer !== null) pins.push({ label, signer });
        pins.sort((a, b) => a.label < b.label ? -1 : a.label > b.label ? 1 : 0);
        const next = JSON.stringify({ v: 1, revision: record.revision + 1, pins });
        if (next.length > MAX_STORED_CHARS || record.revision >= Number.MAX_SAFE_INTEGER - 1) return 'unavailable';
        if (!isCurrent()) return 'conflict';
        storage.setItem(INVOICE_SIGNER_PINS_KEY, next);
        if (storage.getItem(INVOICE_SIGNER_PINS_KEY) !== next) return 'unavailable';
        return signer === null ? 'removed' : 'saved';
      });
      refresh();
      return result;
    } catch { refresh(); return 'unavailable'; }
  };

  return { getSnapshot, subscribe, refresh, change };
}

const browserPins = createInvoiceSignerPinStore();
export const getInvoiceSignerPinsSnapshot = browserPins.getSnapshot;
export const refreshInvoiceSignerPins = browserPins.refresh;
export const changeInvoiceSignerPin = browserPins.change;

/** Pins are refreshed synchronously during render and by same-tab/cross-tab notifications. */
export function useInvoiceSignerPins(): InvoiceSignerPinsSnapshot {
  return useSyncExternalStore(browserPins.subscribe, browserPins.getSnapshot, browserPins.getSnapshot);
}
