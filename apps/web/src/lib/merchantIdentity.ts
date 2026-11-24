import { parseStrictJson } from '@ghostpay/invoice-schema';

/** Public origin/key preferences. These do not authorize invoices or identify a business independently. */
export const MERCHANT_PIN_PREFIX = 'ghostpay.merchantKey.v1:';
const KEY = /^(?:02|03)[0-9a-f]{64}$/;
export type MerchantKey = { readonly kind: 'absent' | 'unavailable' } | { readonly kind: 'saved'; readonly signer: string };
type PinStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function merchantProfileUrl(raw: string): string | undefined {
  try {
    const text = raw.trim();
    if (text.length === 0 || text.length > 2048 || /\s/.test(text)) return undefined;
    const url = new URL(text);
    if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.hash !== '' || url.origin.length > 200) return undefined;
    return url.href;
  } catch { return undefined; }
}

function pinKey(origin: string): string | undefined {
  const url = merchantProfileUrl(origin);
  return url !== undefined && new URL(url).origin === origin ? `${MERCHANT_PIN_PREFIX}${origin}` : undefined;
}

export function merchantKeyStorage(): Storage | undefined {
  try { return globalThis.localStorage; } catch { return undefined; }
}

export function readMerchantKey(origin: string, storage: PinStorage | undefined = merchantKeyStorage()): MerchantKey {
  try {
    const key = pinKey(origin);
    if (storage === undefined || key === undefined) return { kind: 'unavailable' };
    const text = storage.getItem(key);
    if (text === null) return { kind: 'absent' };
    if (text.length > 128) return { kind: 'unavailable' };
    // Reject ambiguous duplicate member names before treating a locally stored pin as trusted.
    const value: unknown = parseStrictJson(text);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return { kind: 'unavailable' };
    const record = value as Record<string, unknown>;
    if (Object.keys(record).length !== 2 || record['v'] !== 1 || typeof record['signer'] !== 'string' || !KEY.test(record['signer'])) return { kind: 'unavailable' };
    return { kind: 'saved', signer: record['signer'] };
  } catch { return { kind: 'unavailable' }; }
}

/** Nonwaiting same-origin transaction. A held/unavailable lock refuses the update. */
export type MerchantPinLock = (name: string, action: () => boolean) => Promise<boolean>;
export function merchantPinLock(): MerchantPinLock | undefined {
  try {
    const locks = globalThis.navigator.locks;
    if (typeof locks?.request !== 'function') return undefined;
    return (name, action) => locks.request(name, { mode: 'exclusive', ifAvailable: true }, (lock) => lock !== null && action());
  } catch { return undefined; }
}

/** Save only after exact, independent full-key confirmation, under the shared origin lock. */
export async function rememberMerchantKey(
  origin: string,
  signer: string,
  confirmation: string,
  storage: PinStorage | undefined = merchantKeyStorage(),
  lock: MerchantPinLock | undefined = merchantPinLock(),
  isCurrent: () => boolean = () => true,
): Promise<boolean> {
  try {
    const key = pinKey(origin);
    if (storage === undefined || key === undefined || lock === undefined || !KEY.test(signer) || confirmation.trim() !== signer) return false;
    return await lock(key, () => {
      if (!isCurrent() || readMerchantKey(origin, storage).kind !== 'absent') return false;
      storage.setItem(key, JSON.stringify({ v: 1, signer }));
      const saved = readMerchantKey(origin, storage);
      return saved.kind === 'saved' && saved.signer === signer;
    });
  } catch { return false; }
}

/** Explicit removal checks the displayed key and current profile inside the same lock as writes. */
export async function forgetMerchantKey(
  origin: string,
  expected: string,
  storage: PinStorage | undefined = merchantKeyStorage(),
  lock: MerchantPinLock | undefined = merchantPinLock(),
  isCurrent: () => boolean = () => true,
): Promise<boolean> {
  try {
    const key = pinKey(origin);
    if (storage === undefined || key === undefined || lock === undefined) return false;
    return await lock(key, () => {
      if (!isCurrent()) return false;
      const saved = readMerchantKey(origin, storage);
      if (saved.kind !== 'saved' || saved.signer !== expected) return false;
      storage.removeItem(key);
      return readMerchantKey(origin, storage).kind === 'absent';
    });
  } catch { return false; }
}
