import type { ReceiptIssue } from './errors.js';
import {
  REDACTABLE_FIELDS,
  RECEIPT_TYPE,
  RECEIPT_VERSION,
  type Receipt,
  type RedactableField,
} from './types.js';
import {
  isAddress,
  isAmountBase,
  isAssetSymbol,
  isChainId,
  isDecimals,
  isDigestHex,
  isForbiddenFieldName,
  isIsoDay,
  isIsoInstant,
  isRedactedAddress,
  isSafeMemo,
  isTxHash,
} from './validate.js';

/** Max accepted serialized receipt size (UTF-16 units). */
export const MAX_RECEIPT_CHARS = 8192;

export type ParseResult =
  | { readonly ok: true; readonly receipt: Receipt }
  | { readonly ok: false; readonly issues: readonly ReceiptIssue[] };

const KEYS = new Set([
  'v',
  'type',
  'createdAt',
  'chain',
  'asset',
  'amount',
  'memo',
  'txHash',
  'sender',
  'recipient',
  'redacted',
  'digest',
]);

function isPlain(v: unknown): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v) as unknown;
  return p === Object.prototype || p === null;
}

/**
 * Strictly parse an untrusted receipt (JSON text or already-parsed value).
 * Checks shape only; call `verifyReceipt` for digest and consistency.
 * @security Size-capped, unknown keys rejected, key-material names flagged FORBIDDEN_FIELD,
 * issue messages never echo input values.
 */
export function parseReceipt(input: unknown): ParseResult {
  let value: unknown = input;
  if (typeof input === 'string') {
    if (input.length > MAX_RECEIPT_CHARS) {
      return { ok: false, issues: [{ code: 'TOO_LARGE', path: '', message: 'receipt too large' }] };
    }
    try {
      value = JSON.parse(input) as unknown;
    } catch {
      return { ok: false, issues: [{ code: 'MALFORMED', path: '', message: 'not valid JSON' }] };
    }
  }
  const issues: ReceiptIssue[] = [];
  const bad = (path: string, message = 'invalid value'): void =>
    void issues.push({ code: 'INVALID_FIELD', path, message });

  if (!isPlain(value))
    return { ok: false, issues: [{ code: 'MALFORMED', path: '', message: 'receipt must be an object' }] };
  const r = value;
  for (const k of Object.keys(r)) {
    if (KEYS.has(k)) continue;
    issues.push(
      isForbiddenFieldName(k)
        ? { code: 'FORBIDDEN_FIELD', path: k, message: 'key material field present' }
        : { code: 'UNKNOWN_FIELD', path: k, message: 'unknown field' },
    );
  }
  if (r['v'] !== RECEIPT_VERSION) bad('v', 'unsupported version');
  if (r['type'] !== RECEIPT_TYPE) bad('type');

  const redactedRaw = r['redacted'];
  const redacted: RedactableField[] = [];
  if (!Array.isArray(redactedRaw)) bad('redacted');
  else {
    const seen = new Set<unknown>();
    for (const f of redactedRaw as unknown[]) {
      if (!(REDACTABLE_FIELDS as readonly unknown[]).includes(f) || seen.has(f)) bad('redacted');
      else redacted.push(f as RedactableField);
      seen.add(f);
    }
  }
  const isRed = (f: RedactableField): boolean => redacted.includes(f);
  const has = (k: string): boolean => r[k] !== undefined;

  // each field: exactly one of present / listed as redacted (memo: may be neither)
  const exclusive = (field: RedactableField, present: boolean): void => {
    if (present && isRed(field)) bad(field, 'field both shown and redacted');
    if (!present && !isRed(field) && field !== 'memo') bad(field, 'field missing and not redacted');
  };

  if (has('createdAt') && !isIsoInstant(r['createdAt']) && !isIsoDay(r['createdAt'])) bad('createdAt');
  exclusive('time', has('createdAt'));
  if (has('chain') && !isChainId(r['chain'])) bad('chain');
  exclusive('chain', has('chain'));

  const asset = r['asset'];
  if (has('asset') !== has('amount')) bad('asset', 'asset and amount must appear together');
  if (has('asset')) {
    if (
      !isPlain(asset) ||
      Object.keys(asset).some((k) => k !== 'symbol' && k !== 'decimals') ||
      !isAssetSymbol(asset['symbol']) ||
      !isDecimals(asset['decimals'])
    )
      bad('asset');
  }
  if (has('amount') && !isAmountBase(r['amount'])) bad('amount');
  exclusive('amount', has('amount'));

  if (has('memo') && !isSafeMemo(r['memo'])) bad('memo');
  exclusive('memo', has('memo'));
  if (has('txHash') && !isTxHash(r['txHash'])) bad('txHash');
  exclusive('txHash', has('txHash'));
  for (const n of ['sender', 'recipient'] as const) {
    if (has(n) && !isAddress(r[n]) && !isRedactedAddress(r[n])) bad(n);
    exclusive(n, has(n));
  }

  const d = r['digest'];
  if (!isPlain(d) || Object.keys(d).length !== 2 || d['alg'] !== 'SHA-256' || !isDigestHex(d['hex']))
    bad('digest');

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, receipt: r as unknown as Receipt };
}
