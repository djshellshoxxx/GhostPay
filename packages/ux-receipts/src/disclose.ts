import { redactAddress, TRUNCATED } from './address.js';
import { digestBody } from './digest.js';
import { ReceiptError } from './errors.js';
import { detectSecretLikeText } from './secrets.js';
import {
  REDACTABLE_FIELDS, RECEIPT_TYPE, RECEIPT_VERSION,
  type AddressForm, type DisclosurePolicy, type PaymentRecord, type Receipt, type RedactableField,
} from './types.js';
import {
  isAddress, isAmountBase, isAssetSymbol, isChainId, isDecimals, isForbiddenFieldName,
  isIsoInstant, isSafeMemo, isTxHash,
} from './validate.js';

/**
 * Disclosure presets. None can reveal key material: the record type has none.
 * - minimal: proves only that a receipt exists (day, nothing else).
 * - standard: amount + chain + exact time, truncated addresses; no memo, no tx hash.
 * - full: everything in the record, full addresses.
 */
export const PRESETS: Readonly<Record<'minimal' | 'standard' | 'full', DisclosurePolicy>> = {
  minimal: { time: 'day', chain: false, amount: false, memo: false, txHash: false, sender: 'hidden', recipient: 'hidden' },
  standard: { time: 'exact', chain: true, amount: true, memo: false, txHash: false, sender: TRUNCATED, recipient: TRUNCATED },
  full: { time: 'exact', chain: true, amount: true, memo: true, txHash: true, sender: 'full', recipient: 'full' },
};

const RECORD_KEYS = new Set([
  'createdAt', 'chain', 'asset', 'amountBase', 'memo', 'txHash', 'sender', 'recipient', 'recipientKind',
]);

const bad = (path: string, msg = 'invalid value'): ReceiptError => new ReceiptError('INVALID_FIELD', path, msg);

function isPlain(v: unknown): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v) as unknown;
  return p === Object.prototype || p === null;
}

/**
 * Strictly validate an untrusted/loosely typed record.
 * @security Rejects any unknown property; names resembling key material give FORBIDDEN_FIELD
 * so stealth/viewing/spending keys can never ride into a receipt.
 */
export function validateRecord(input: unknown): PaymentRecord {
  if (!isPlain(input)) throw bad('record', 'record must be an object');
  for (const k of Object.keys(input)) {
    if (RECORD_KEYS.has(k)) continue;
    throw isForbiddenFieldName(k)
      ? new ReceiptError('FORBIDDEN_FIELD', k, 'key material must never enter a receipt')
      : new ReceiptError('UNKNOWN_FIELD', k, 'unknown field');
  }
  const r = input;
  if (!isIsoInstant(r['createdAt'])) throw bad('createdAt');
  if (!isChainId(r['chain'])) throw bad('chain');
  const asset = r['asset'];
  if (!isPlain(asset) || Object.keys(asset).some((k) => k !== 'symbol' && k !== 'decimals')) throw bad('asset');
  if (!isAssetSymbol(asset['symbol'])) throw bad('asset.symbol');
  if (!isDecimals(asset['decimals'])) throw bad('asset.decimals');
  if (!isAmountBase(r['amountBase'])) throw bad('amountBase');
  const txHash = r['txHash'];
  if (!isTxHash(txHash)) throw bad('txHash');
  if (!isAddress(r['sender'])) throw bad('sender');
  if (!isAddress(r['recipient'])) throw bad('recipient');
  const kind = r['recipientKind'];
  if (kind !== 'stealth' && kind !== 'public') throw bad('recipientKind');
  const memo = r['memo'];
  if (memo !== undefined && !isSafeMemo(memo)) throw bad('memo');
  return {
    createdAt: r['createdAt'],
    chain: r['chain'],
    asset: { symbol: asset['symbol'], decimals: asset['decimals'] },
    amountBase: r['amountBase'],
    ...(memo === undefined ? {} : { memo }),
    txHash,
    sender: r['sender'],
    recipient: r['recipient'],
    recipientKind: kind,
  };
}

function checkForm(f: unknown, path: string): void {
  if (f === 'full' || f === 'hidden') return;
  if (!isPlain(f) || !Number.isInteger(f['head']) || !Number.isInteger(f['tail'])) {
    throw new ReceiptError('INVALID_POLICY', path, 'invalid address form');
  }
}

/** Validate a policy object (it may come from persisted settings). */
export function validatePolicy(p: unknown): DisclosurePolicy {
  if (!isPlain(p)) throw new ReceiptError('INVALID_POLICY', 'policy', 'policy must be an object');
  const t = p['time'];
  if (t !== 'exact' && t !== 'day' && t !== 'hidden') throw new ReceiptError('INVALID_POLICY', 'time', 'invalid time form');
  for (const k of ['chain', 'amount', 'memo', 'txHash'] as const) {
    if (typeof p[k] !== 'boolean') throw new ReceiptError('INVALID_POLICY', k, 'must be boolean');
  }
  checkForm(p['sender'], 'sender');
  checkForm(p['recipient'], 'recipient');
  return p as unknown as DisclosurePolicy;
}

/**
 * Build a shareable receipt from a private record by applying a disclosure policy.
 * Withheld values are absent from the output entirely (not masked), so they cannot be recovered.
 * @security Throws SECRET_LIKE_MEMO if a revealed memo looks like a key/seed. The digest is
 * integrity-only, not a signature.
 */
export async function createReceipt(recordInput: unknown, policyInput: unknown): Promise<Receipt> {
  const rec = validateRecord(recordInput);
  const pol = validatePolicy(policyInput);
  const redacted: RedactableField[] = [];
  const body: Record<string, unknown> = { v: RECEIPT_VERSION, type: RECEIPT_TYPE };

  if (pol.time === 'exact') body['createdAt'] = rec.createdAt;
  else if (pol.time === 'day') body['createdAt'] = rec.createdAt.slice(0, 10);
  else redacted.push('time');

  if (pol.chain) body['chain'] = rec.chain;
  else redacted.push('chain');

  if (pol.amount) {
    body['asset'] = { symbol: rec.asset.symbol, decimals: rec.asset.decimals };
    body['amount'] = rec.amountBase;
  } else redacted.push('amount');

  if (pol.memo) {
    if (rec.memo !== undefined) {
      if (detectSecretLikeText(rec.memo).length > 0) {
        throw new ReceiptError('SECRET_LIKE_MEMO', 'memo', 'memo looks like secret material and cannot be shared');
      }
      body['memo'] = rec.memo;
    }
  } else redacted.push('memo');

  if (pol.txHash) body['txHash'] = rec.txHash;
  else redacted.push('txHash');

  const addr = (name: 'sender' | 'recipient', form: AddressForm): void => {
    const shown = redactAddress(rec[name], form, name);
    if (shown === undefined) redacted.push(name);
    else body[name] = shown;
  };
  addr('sender', pol.sender);
  addr('recipient', pol.recipient);

  body['redacted'] = REDACTABLE_FIELDS.filter((f) => redacted.includes(f));
  const hex = await digestBody(body);
  return { ...body, digest: { alg: 'SHA-256', hex } } as unknown as Receipt;
}
