import { validatePolicy, validateRecord } from './disclose.js';
import { detectSecretLikeText } from './secrets.js';

export type WarningSeverity = 'info' | 'caution' | 'high';

export interface PrivacyWarning {
  /** Stable code; use as i18n key suffix `receipts.warn.<code>`. */
  readonly code: string;
  readonly severity: WarningSeverity;
}

/**
 * Privacy warnings to show BEFORE the user shares. Pure; deterministic order.
 * @security Informational only: callers must not treat absence of warnings as safe.
 */
export function analyzeDisclosure(recordInput: unknown, policyInput: unknown): PrivacyWarning[] {
  const rec = validateRecord(recordInput);
  const pol = validatePolicy(policyInput);
  const w: PrivacyWarning[] = [];
  const add = (code: string, severity: WarningSeverity): void => void w.push({ code, severity });

  const senderFull = pol.sender === 'full';
  const recipFull = pol.recipient === 'full';
  const truncated = (f: unknown): boolean => typeof f === 'object';

  if (pol.memo && rec.memo !== undefined) {
    if (detectSecretLikeText(rec.memo).length > 0) add('memo_secret_like', 'high');
    add('memo_free_text', 'caution');
  }
  if (pol.txHash) {
    add('txhash_links_onchain', senderFull || recipFull ? 'high' : 'caution');
    if (!pol.chain) add('txhash_without_chain', 'info');
  }
  if (senderFull) add('sender_full_address', 'high');
  if (recipFull) {
    add(rec.recipientKind === 'stealth' ? 'stealth_recipient_full' : 'recipient_full_address', 'caution');
  }
  if (truncated(pol.sender) || truncated(pol.recipient)) add('truncated_address_matchable', 'info');
  if (pol.time === 'exact' && pol.txHash) add('exact_time_with_txhash', 'info');
  if (!pol.txHash || !pol.chain) add('not_chain_checkable', 'info');
  add('digest_not_signature', 'info');
  add('sharing_irreversible', 'info');
  return w;
}
