import { readAttempts, clearAttempt, type AttemptStorage, type WalletAttempt } from '../../lib/duplicateAttemptJournal';
import { UserFacingError } from '../../lib/errors';
import { sendViaWallet, walletAttemptKey, type TxRequest, type WalletSession } from '../../lib/wallet';

export interface PolicyLockManager {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

/** Reuses the bounded attempt schema. Only metadata and hashes persist; never request calldata or seller secrets. */
export function policyAttemptStorage(): AttemptStorage {
  try {
    if (typeof window === 'undefined') throw new Error();
    return window.localStorage;
  } catch { throw new UserFacingError({ key: 'policy.withdraw.journalUnavailable' }); }
}

function locks(): PolicyLockManager {
  if (typeof navigator === 'undefined' || navigator.locks === undefined) throw new UserFacingError({ key: 'policy.withdraw.journalUnavailable' });
  return { async request<T>(name: string, callback: () => Promise<T>): Promise<T> {
    return await navigator.locks.request(name, { mode: 'exclusive' }, callback);
  } };
}

export function policyActionKey(wallet: Pick<WalletSession, 'chainId' | 'account'>, tx: TxRequest, scope: string): string {
  return walletAttemptKey(wallet, tx, { kind: 'transaction', logicalAction: true, scope });
}

export function policyActionAttempts(key: string, storage = policyAttemptStorage()): readonly WalletAttempt[] {
  return readAttempts(storage).filter((a) => a.key === key);
}

/** No automatic clearing: a reorg or absent transaction is not proof that a prior submission cannot mine. */
export async function clearPolicyAction(key: string, confirmed: boolean, storage = policyAttemptStorage(), lockManager = locks(), assertCurrent: () => void = () => undefined): Promise<void> {
  await lockManager.request('ghostpay:durable-wallet-attempts:v1', () => {
    assertCurrent();
    clearAttempt(key, confirmed, storage);
    assertCurrent();
    return Promise.resolve();
  });
}

/**
 * All tabs serialize read/begin/finish under one journal lock. A missing lock/storage capability refuses.
 * The returned hash is saved by sendViaWallet even if the initiating seller session changed after broadcast.
 */
export async function sendPolicyAction(p: {
  readonly wallet: WalletSession; readonly prepare: () => Promise<TxRequest>; readonly scope: string; readonly assertCurrent: () => void;
  readonly storage?: AttemptStorage; readonly lockManager?: PolicyLockManager;
}): Promise<`0x${string}`> {
  const storage = p.storage ?? policyAttemptStorage();
  const manager = p.lockManager ?? locks();
  return manager.request('ghostpay:durable-wallet-attempts:v1', async () => {
    p.assertCurrent();
    const key = policyActionKey(p.wallet, { to: p.wallet.account, data: '0x', value: 0n }, p.scope);
    if (policyActionAttempts(key, storage).length > 0) throw new UserFacingError({ key: 'policy.withdraw.previousAttempt' });
    const tx = await p.prepare();
    p.assertCurrent();
    return sendViaWallet(p.wallet, tx, p.assertCurrent, { kind: 'transaction', logicalAction: true, scope: p.scope, storage });
  });
}
