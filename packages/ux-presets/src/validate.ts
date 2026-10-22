import { err, ok, type AmountRule, type PaymentRecord, type Preset, type Result } from './types.js';

/** Amounts must stay below 10^78 (uint256 sized). */
export const MAX_AMOUNT = 10n ** 78n;
export const MAX_LABEL_CODEPOINTS = 64;
export const MAX_MEMO_CODEPOINTS = 140;
export const MAX_ADDRESS_LENGTH = 128;
export const MAX_TIMESTAMP = 8_640_000_000_000_000;

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const REF_RE = /^[A-Za-z0-9_.:-]{1,64}$/;
const CHAIN_RE = /^[a-z0-9-]{3,8}:[A-Za-z0-9_-]{1,32}$/;
const ASSET_RE = /^[a-z0-9-]{3,8}:[A-Za-z0-9_-]{1,32}\/[a-z0-9-]{3,8}:[A-Za-z0-9._%-]{1,128}$/;
const SLUG_RE = /^[a-z][a-z0-9-]{0,31}$/;
const BIDI_AND_SEPARATORS = new Set([0x2028, 0x2029, 0x200e, 0x200f, 0xfeff]);

function hasForbiddenChar(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c <= 0x1f || (c >= 0x7f && c <= 0x9f)) return true;
    if (BIDI_AND_SEPARATORS.has(c) || (c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069))
      return true;
  }
  return false;
}
const LONE_SURROGATE_RE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

export const isId = (s: unknown): s is string => typeof s === 'string' && ID_RE.test(s);

/**
 * Validate user-visible text: NFC, no control/bidi-override chars, no lone
 * surrogates, bounded in code points.
 * @security Rejects (never silently rewrites) so what is stored is what was reviewed.
 */
export function isSafeText(s: unknown, maxCodePoints: number, allowEmpty: boolean): s is string {
  if (typeof s !== 'string') return false;
  if (s.length === 0) return allowEmpty;
  if (s.length > maxCodePoints * 2) return false;
  if (hasForbiddenChar(s) || LONE_SURROGATE_RE.test(s)) return false;
  if (s.normalize('NFC') !== s) return false;
  return [...s].length <= maxCodePoints;
}

export const isChain = (s: unknown): s is string => typeof s === 'string' && CHAIN_RE.test(s);

/** `native` or a CAIP-19 like id that belongs to `chain`. */
export function isAssetFor(chain: string, asset: unknown): asset is string {
  if (asset === 'native') return true;
  return typeof asset === 'string' && ASSET_RE.test(asset) && asset.startsWith(`${chain}/`);
}

export const isPositiveAmount = (n: unknown): n is bigint =>
  typeof n === 'bigint' && n > 0n && n < MAX_AMOUNT;
export const isNonNegativeAmount = (n: unknown): n is bigint =>
  typeof n === 'bigint' && n >= 0n && n < MAX_AMOUNT;
const isTimestamp = (n: unknown): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= MAX_TIMESTAMP;

/** Syntactic bound only; real address syntax is the injected, chain-specific validator's job. */
export function isAddressShape(s: unknown): s is string {
  return typeof s === 'string' && s.length >= 1 && s.length <= MAX_ADDRESS_LENGTH && /^[\x21-\x7E]+$/.test(s);
}

function hasExactKeys(o: object, keys: readonly string[]): boolean {
  const own = Object.keys(o);
  return own.length === keys.length && keys.every((k) => Object.prototype.hasOwnProperty.call(o, k));
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v) as unknown;
  return p === Object.prototype || p === null;
}

export function validateAmountRule(v: unknown): Result<AmountRule> {
  const bad = () => err<AmountRule>('invalid-preset', 'invalid amount rule');
  if (!isPlainObject(v)) return bad();
  if (v.kind === 'fixed') {
    if (!hasExactKeys(v, ['kind', 'amount']) || !isPositiveAmount(v.amount)) return bad();
    return ok({ kind: 'fixed', amount: v.amount });
  }
  if (v.kind === 'ask') {
    return hasExactKeys(v, ['kind']) ? ok({ kind: 'ask' }) : bad();
  }
  if (v.kind === 'up-to') {
    if (!hasExactKeys(v, ['kind', 'max']) || !isPositiveAmount(v.max)) return bad();
    return ok({ kind: 'up-to', max: v.max });
  }
  return bad();
}

const PRESET_KEYS = [
  'id',
  'label',
  'payeeRef',
  'chain',
  'asset',
  'amountRule',
  'privacyProfile',
  'memo',
  'createdAt',
  'updatedAt',
] as const;

/**
 * Strictly validate an untrusted value as a Preset. Unknown or missing fields,
 * wrong types and out-of-range values all fail; the result is a fresh object.
 * @security Input may come from storage after decryption or from imports.
 */
export function validatePreset(v: unknown): Result<Preset> {
  const bad = (m: string) => err<Preset>('invalid-preset', m);
  if (!isPlainObject(v) || !hasExactKeys(v, PRESET_KEYS)) return bad('preset shape');
  if (!isId(v.id)) return bad('id');
  if (!isSafeText(v.label, MAX_LABEL_CODEPOINTS, false)) return bad('label');
  if (typeof v.payeeRef !== 'string' || !REF_RE.test(v.payeeRef)) return bad('payeeRef');
  if (!isChain(v.chain)) return bad('chain');
  if (!isAssetFor(v.chain, v.asset)) return bad('asset');
  const rule = validateAmountRule(v.amountRule);
  if (!rule.ok) return bad('amountRule');
  if (typeof v.privacyProfile !== 'string' || !SLUG_RE.test(v.privacyProfile)) return bad('privacyProfile');
  if (!isSafeText(v.memo, MAX_MEMO_CODEPOINTS, true)) return bad('memo');
  if (!isTimestamp(v.createdAt) || !isTimestamp(v.updatedAt) || v.updatedAt < v.createdAt)
    return bad('timestamps');
  return ok({
    id: v.id,
    label: v.label,
    payeeRef: v.payeeRef,
    chain: v.chain,
    asset: v.asset,
    amountRule: rule.value,
    privacyProfile: v.privacyProfile,
    memo: v.memo,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
  });
}

const RISKS = ['none', 'low', 'medium', 'high', 'unknown'] as const;
export const isRisk = (v: unknown): v is (typeof RISKS)[number] => RISKS.includes(v as never);

const RECORD_KEYS = [
  'id',
  'payeeRef',
  'address',
  'chain',
  'asset',
  'amount',
  'fee',
  'privacyProfile',
  'memo',
  'addressRisk',
  'paidAt',
] as const;

/** Strictly validate an untrusted value as a PaymentRecord. */
export function validateRecord(v: unknown): Result<PaymentRecord> {
  const bad = (m: string) => err<PaymentRecord>('invalid-record', m);
  if (!isPlainObject(v) || !hasExactKeys(v, RECORD_KEYS)) return bad('record shape');
  if (!isId(v.id)) return bad('id');
  if (typeof v.payeeRef !== 'string' || !REF_RE.test(v.payeeRef)) return bad('payeeRef');
  if (!isAddressShape(v.address)) return bad('address');
  if (!isChain(v.chain)) return bad('chain');
  if (!isAssetFor(v.chain, v.asset)) return bad('asset');
  if (!isPositiveAmount(v.amount)) return bad('amount');
  if (!isNonNegativeAmount(v.fee)) return bad('fee');
  if (typeof v.privacyProfile !== 'string' || !SLUG_RE.test(v.privacyProfile)) return bad('privacyProfile');
  if (!isSafeText(v.memo, MAX_MEMO_CODEPOINTS, true)) return bad('memo');
  if (!isRisk(v.addressRisk)) return bad('addressRisk');
  if (!isTimestamp(v.paidAt)) return bad('paidAt');
  return ok({
    id: v.id,
    payeeRef: v.payeeRef,
    address: v.address,
    chain: v.chain,
    asset: v.asset,
    amount: v.amount,
    fee: v.fee,
    privacyProfile: v.privacyProfile,
    memo: v.memo,
    addressRisk: v.addressRisk,
    paidAt: v.paidAt,
  });
}

/** JSON-safe form of a preset (bigint -> decimal string). */
export function presetToJson(p: Preset): Record<string, unknown> {
  const r = p.amountRule;
  const amountRule =
    r.kind === 'fixed'
      ? { kind: 'fixed', amount: r.amount.toString() }
      : r.kind === 'up-to'
        ? { kind: 'up-to', max: r.max.toString() }
        : { kind: 'ask' };
  return { ...p, amountRule };
}

const DEC_RE = /^(0|[1-9][0-9]{0,77})$/;

/** Inverse of {@link presetToJson}, strictly validating. */
export function presetFromJson(v: unknown): Result<Preset> {
  if (!isPlainObject(v) || !isPlainObject(v.amountRule)) return err('invalid-preset', 'preset shape');
  const r = v.amountRule;
  const conv = (x: unknown): unknown => (typeof x === 'string' && DEC_RE.test(x) ? BigInt(x) : x);
  const rule: Record<string, unknown> = { ...r };
  if ('amount' in rule) rule.amount = conv(rule.amount);
  if ('max' in rule) rule.max = conv(rule.max);
  return validatePreset({ ...v, amountRule: rule });
}
