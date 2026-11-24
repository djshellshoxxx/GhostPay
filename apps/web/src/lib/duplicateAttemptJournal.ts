import { keccak256, toBytes } from 'viem/utils';
import { parseStrictJson } from '@ghostpay/invoice-schema';
import { UserFacingError } from './errors';

export const ATTEMPT_JOURNAL_KEY = 'ghostpay.wallet-attempts.v1';
export const ATTEMPT_JOURNAL_EVENT = 'ghostpay:wallet-attempts';
const MAX_ATTEMPTS = 128;
const MAX_BYTES = 100_000;
export interface AttemptStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}
export interface AttemptInput {
  readonly key: string;
  readonly chainId: number;
  readonly account: string;
  readonly kind: 'payment' | 'approval' | 'registry' | 'transaction';
}
export interface WalletAttempt extends AttemptInput {
  readonly id: string;
  readonly createdAt: number;
  readonly status: 'unknown' | 'submitted';
  readonly hash?: string;
}
function fail(): never { throw new UserFacingError({ key: 'error.duplicateAttemptJournal.theWalletAttemptJournalIsUnavailableOrInvalidNoNew' }); }
export function browserAttemptStorage(): AttemptStorage | undefined {
  if (typeof window === 'undefined') return undefined;
  try { return window.sessionStorage; } catch { return fail(); }
}
function requiredStorage(storage?: AttemptStorage): AttemptStorage {
  return storage ?? browserAttemptStorage() ?? fail();
}
function validAttempt(v: unknown): v is WalletAttempt {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const a = v as Record<string, unknown>;
  if (Object.keys(a).some((key) => !['id', 'key', 'chainId', 'account', 'kind', 'createdAt', 'status', 'hash'].includes(key))) return false;
  return typeof a['id'] === 'string' && /^[0-9a-f-]{36}$/.test(a['id']) && typeof a['key'] === 'string' && /^0x[0-9a-f]{64}$/.test(a['key']) &&
    Number.isSafeInteger(a['chainId']) && (a['chainId'] as number) > 0 &&
    typeof a['account'] === 'string' && /^0x[0-9a-f]{40}$/.test(a['account']) &&
    typeof a['kind'] === 'string' && ['payment', 'approval', 'registry', 'transaction'].includes(a['kind']) &&
    Number.isSafeInteger(a['createdAt']) && (a['createdAt'] as number) > 0 &&
    ((a['status'] === 'unknown' && a['hash'] === undefined) ||
      (a['status'] === 'submitted' && typeof a['hash'] === 'string' && /^0x[0-9a-f]{64}$/.test(a['hash'])));
}
export function readAttempts(storage?: AttemptStorage): readonly WalletAttempt[] {
  const store = requiredStorage(storage);
  let raw: string | null;
  try { raw = store.getItem(ATTEMPT_JOURNAL_KEY); } catch { return fail(); }
  if (raw === null) return [];
  if (raw.length > MAX_BYTES || new TextEncoder().encode(raw).byteLength > MAX_BYTES) return fail();
  let data: unknown;
  try { data = parseStrictJson(raw); } catch { return fail(); }
  if (!Array.isArray(data) || data.length > MAX_ATTEMPTS || !data.every(validAttempt) || new Set(data.map((a) => a.id)).size !== data.length) return fail();
  return data;
}
function write(records: readonly WalletAttempt[], storage: AttemptStorage): void {
  const text = JSON.stringify(records);
  if (records.length > MAX_ATTEMPTS || text.length > MAX_BYTES) return fail();
  try {
    storage.setItem(ATTEMPT_JOURNAL_KEY, text);
    if (storage.getItem(ATTEMPT_JOURNAL_KEY) !== text) return fail();
  } catch { return fail(); }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(ATTEMPT_JOURNAL_EVENT));
}
/** No expiry or automatic eviction: a wallet may have broadcast even when its response was lost. */
export function beginAttempt(input: AttemptInput, storage?: AttemptStorage): WalletAttempt {
  const store = requiredStorage(storage);
  const records = readAttempts(store);
  if (records.some((a) => a.key === input.key)) throw new UserFacingError({ key: 'error.duplicateAttemptJournal.aPreviousWalletAttemptForThisActionAlreadyExistsIn' });
  if (records.length >= MAX_ATTEMPTS) throw new UserFacingError({ key: 'error.duplicateAttemptJournal.theWalletAttemptJournalReachedItsSafetyLimitReviewAnd' });
  const attempt: WalletAttempt = { ...input, id: crypto.randomUUID(), account: input.account.toLowerCase(), createdAt: Date.now(), status: 'unknown' };
  if (!validAttempt(attempt)) return fail();
  write([...records, attempt], store);
  return attempt;
}
/** Called immediately on the returned hash, even when the initiating page/session has changed. */
export function finishAttempt(attempt: WalletAttempt, hash: string, storage?: AttemptStorage): void {
  const store = requiredStorage(storage);
  const next = { ...attempt, status: 'submitted' as const, hash: hash.toLowerCase() };
  if (!validAttempt(next)) return fail();
  const records = readAttempts(store).filter((a) => a.id !== attempt.id);
  write([...records, next], store);
}
// Keep optional destination metadata outside the strict, versioned double-payment barrier.
// Each fingerprint is salted by the existing random attempt ID, including for identical recipients.
const destinationKey = (id: string): string => `ghostpay.payment-destination.v1.${id}`;
function destinationTag(id: string, destination: string): string | undefined {
  const address = destination.trim().toLowerCase();
  return /^0x[0-9a-f]{40}$/.test(address) ? keccak256(toBytes(`${id}|${address}`)) : undefined;
}

/** Best effort, after the provider was asked. A lost response is still a request, not proof of payment. */
export function rememberPaymentDestination(attempt: WalletAttempt, destination: string, store: AttemptStorage): void {
  if (attempt.kind !== 'payment') return;
  try {
    const tag = destinationTag(attempt.id, destination);
    if (tag !== undefined) store.setItem(destinationKey(attempt.id), tag);
  } catch { /* An advisory write must never obscure the wallet outcome. */ }
}

export type PaymentHistoryNotice = 'destination' | 'invoice' | 'invoice-destination' | 'unavailable' | undefined;
export function paymentHistoryNotice(
  review: Pick<AttemptInput, 'key' | 'chainId' | 'account'>, destination: string, storage?: AttemptStorage,
): PaymentHistoryNotice {
  try {
    const store = requiredStorage(storage);
    let retry: PaymentHistoryNotice;
    const account = review.account.toLowerCase();
    for (const attempt of readAttempts(store)) {
      if (attempt.kind !== 'payment' || attempt.chainId !== review.chainId || attempt.account !== account) continue;
      const saved = store.getItem(destinationKey(attempt.id));
      const sameDestination = saved !== null && saved === destinationTag(attempt.id, destination);
      if (attempt.key !== review.key && sameDestination) return 'destination';
      if (attempt.key === review.key) retry = sameDestination ? 'invoice-destination' : (retry ?? 'invoice');
    }
    return retry;
  } catch { return 'unavailable'; }
}

/** Clearing is only bookkeeping; it cannot cancel or roll back a wallet request or transaction. */
export function clearAttempt(key: string, confirmed: boolean, storage?: AttemptStorage): void {
  if (!confirmed) throw new UserFacingError({ key: 'error.duplicateAttemptJournal.explicitConfirmationIsRequiredToClearAWalletAttempt' });
  const store = requiredStorage(storage);
  const records = readAttempts(store);
  write(records.filter((a) => a.id !== key && a.key !== key), store);
  for (const record of records) {
    if (record.kind === 'payment' && (record.id === key || record.key === key)) {
      try { store.removeItem?.(destinationKey(record.id)); } catch { /* An unreferenced tag cannot match a future attempt. */ }
    }
  }
}

// i18n-use: error.duplicateAttemptJournal.theWalletAttemptJournalIsUnavailableOrInvalidNoNew error.duplicateAttemptJournal.aPreviousWalletAttemptForThisActionAlreadyExistsIn error.duplicateAttemptJournal.theWalletAttemptJournalReachedItsSafetyLimitReviewAnd error.duplicateAttemptJournal.explicitConfirmationIsRequiredToClearAWalletAttempt
