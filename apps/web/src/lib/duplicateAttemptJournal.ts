import { UserFacingError } from './errors';

export const ATTEMPT_JOURNAL_KEY = 'ghostpay.wallet-attempts.v1';
export const ATTEMPT_JOURNAL_EVENT = 'ghostpay:wallet-attempts';
const MAX_ATTEMPTS = 128;
const MAX_BYTES = 100_000;
export interface AttemptStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
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
function fail(): never { throw new UserFacingError('The wallet attempt journal is unavailable or invalid. No new wallet request was started.'); }
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
    ['payment', 'approval', 'registry', 'transaction'].includes(String(a['kind'])) &&
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
  try { data = JSON.parse(raw) as unknown; } catch { return fail(); }
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
  if (records.some((a) => a.key === input.key)) throw new UserFacingError('A previous wallet attempt for this action already exists in this tab. Check its outcome before explicitly clearing it; do not send again blindly.');
  if (records.length >= MAX_ATTEMPTS) throw new UserFacingError('The wallet attempt journal reached its safety limit. Review and explicitly clear old attempts before starting another.');
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
/** Clearing is only bookkeeping; it cannot cancel or roll back a wallet request or transaction. */
export function clearAttempt(key: string, confirmed: boolean, storage?: AttemptStorage): void {
  if (!confirmed) throw new UserFacingError('Explicit confirmation is required to clear a wallet attempt.');
  const store = requiredStorage(storage);
  write(readAttempts(store).filter((a) => a.id !== key && a.key !== key), store);
}
