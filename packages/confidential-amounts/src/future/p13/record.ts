/**
 * P13 confidential payment record: the local plaintext model and its canonical codec. Amounts live in
 * `SecretAmount`s in memory and as `DecimalUnits` only inside the encrypted envelope (see `store.ts`).
 * Decoding is strict and canonical: re-encoding a decoded record must reproduce the input bytes exactly.
 */
import { canonicalize, parseStrictJson } from '@ghostpay/invoice-schema';
import { P13Error, check, fail } from './errors.js';
import { assertDigest, assetDigest, decodeConfidentialAsset, type ConfidentialAssetV1, type Digest, type P13ProtocolId } from './asset.js';
import { isP13State, type P13State } from './lifecycle.js';
import { SecretAmount, assertNoSecretAmount } from './secret.js';
import { EUINT64_DOMAIN, confidentialRouterSplit, formatDecimalUnits, parseDecimalUnits } from './units.js';
import { exactRecord, intIn, matchString } from './strict.js';

/** Largest plaintext record (spec: 64 KiB metadata cap). */
export const MAX_RECORD_BYTES = 64 * 1024;
/** 9999-12-31T23:59:59Z, the invoice-schema time ceiling. */
export const MAX_TIME = 253_402_300_799;
const MAX_REVISION = 2 ** 31 - 1;
const RECORD_ID_RE = /^[0-9a-f]{32}$/;
const TX_HASH_RE = /^0x[0-9a-f]{64}$/;
const KECCAK_RE = /^keccak256:[0-9a-f]{64}$/;
const SHA_RE = /^sha256:[0-9a-f]{64}$/;

/** Router amounts of one payment, in confidential-token units. `fee + net == gross` always. */
export interface RecordAmounts {
  readonly gross: SecretAmount;
  readonly fee: SecretAmount;
  readonly net: SecretAmount;
}

/** Why a record is in its evidence state. */
export type EvidenceReason =
  | 'no-receipt'
  | 'confirmations'
  | 'unverified-source'
  | 'not-decrypted'
  | 'zero-delivery'
  | 'underpaid'
  | 'delivered'
  | 'reverted'
  | 'reloaded';

/** Non-secret evidence notes. */
export interface RecordEvidence {
  readonly txHash?: string;
  readonly reason?: EvidenceReason;
}

/** Local confidential payment record. */
export interface ConfidentialRecordV1 {
  readonly schema: 'ghostpay.confidential-record/v1';
  readonly recordId: string;
  readonly revision: number;
  readonly state: P13State;
  readonly protocolId: P13ProtocolId;
  readonly asset: ConfidentialAssetV1;
  readonly assetDigest: Digest;
  readonly invoiceDigest: Digest;
  readonly planDigest: Digest;
  readonly feePolicy: 'payer_pays' | 'seller_pays';
  readonly amounts: RecordAmounts;
  readonly sessionEpoch: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly evidence?: RecordEvidence;
}

/** Public, amount-free view (safe for UI state and lists). */
export interface RecordSummary {
  readonly recordId: string;
  readonly revision: number;
  readonly state: P13State;
  readonly protocolId: P13ProtocolId;
  readonly assetDigest: Digest;
  readonly invoiceDigest: Digest;
  readonly planDigest: Digest;
  readonly createdAt: number;
  readonly updatedAt: number;
}

const REASONS: readonly string[] = ['no-receipt', 'confirmations', 'unverified-source', 'not-decrypted', 'zero-delivery', 'underpaid', 'delivered', 'reverted', 'reloaded'];

/** Builds router amounts from a gross amount (the only way to create {@link RecordAmounts}). */
export function amountsFromGross(gross: bigint): RecordAmounts {
  const s = confidentialRouterSplit(gross);
  return {
    gross: SecretAmount.from(s.gross),
    fee: SecretAmount.from(s.fee, { min: 0n, max: EUINT64_DOMAIN.max }),
    net: SecretAmount.from(s.net),
  };
}

/** Amount-free summary; verified free of secrets before it is returned. */
export function summarize(r: ConfidentialRecordV1): RecordSummary {
  const s: RecordSummary = {
    recordId: r.recordId,
    revision: r.revision,
    state: r.state,
    protocolId: r.protocolId,
    assetDigest: r.assetDigest,
    invoiceDigest: r.invoiceDigest,
    planDigest: r.planDigest,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
  assertNoSecretAmount(s);
  return s;
}

function toJson(r: ConfidentialRecordV1): unknown {
  const reveal = (a: SecretAmount): string => a.reveal(formatDecimalUnits);
  return {
    schema: r.schema,
    recordId: r.recordId,
    revision: r.revision,
    state: r.state,
    protocolId: r.protocolId,
    asset: r.asset,
    assetDigest: r.assetDigest,
    invoiceDigest: r.invoiceDigest,
    planDigest: r.planDigest,
    feePolicy: r.feePolicy,
    amounts: { gross: reveal(r.amounts.gross), fee: reveal(r.amounts.fee), net: reveal(r.amounts.net) },
    sessionEpoch: r.sessionEpoch,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    ...(r.evidence !== undefined ? { evidence: { ...r.evidence } } : {}),
  };
}

/** Canonical JSON of the fields that never change after creation (everything but revision, state, time, evidence). */
function immutableJson(r: ConfidentialRecordV1): string {
  const j = toJson(r) as Record<string, unknown>;
  const rest = Object.fromEntries(Object.entries(j).filter(([k]) => !['revision', 'state', 'updatedAt', 'evidence'].includes(k)));
  return canonicalize(rest);
}

/** True if `a` and `b` are revisions of the same plan (identical immutable fields). */
export function sameLineage(a: ConfidentialRecordV1, b: ConfidentialRecordV1): boolean {
  return immutableJson(a) === immutableJson(b);
}

/**
 * Canonical UTF-8 bytes of a record. The result contains plaintext amounts: pass it only to a `RecordSealer`.
 * @throws {P13Error} `P13_RECORD_INVALID` if the record does not round-trip through {@link decodeRecord}.
 */
export function encodeRecord(r: ConfidentialRecordV1): Uint8Array {
  let text: string;
  try {
    text = canonicalize(toJson(r));
  } catch (e) {
    if (e instanceof P13Error) throw e;
    return fail('P13_RECORD_INVALID', 'record has a non-canonical field');
  }
  const bytes = new TextEncoder().encode(text);
  check(bytes.length <= MAX_RECORD_BYTES, 'P13_RECORD_LIMIT', 'record too large');
  decodeRecord(bytes); // validates every field and the router split
  return bytes;
}

/** Strictly decodes untrusted {@link RecordEvidence}. */
export function decodeEvidence(v: unknown): RecordEvidence {
  const e = exactRecord(v, [], ['txHash', 'reason'], 'P13_RECORD_INVALID');
  const out: { txHash?: string; reason?: EvidenceReason } = {};
  if (e['txHash'] !== undefined) out.txHash = matchString(e['txHash'], TX_HASH_RE, 'P13_RECORD_INVALID');
  if (e['reason'] !== undefined) {
    const reason = e['reason'];
    check(typeof reason === 'string' && REASONS.includes(reason), 'P13_RECORD_INVALID', 'invalid evidence reason');
    out.reason = reason as EvidenceReason;
  }
  return out;
}

/**
 * Strictly decodes record bytes (UTF-8, strict JSON, exact keys, canonical form, valid asset, consistent split).
 * @throws {P13Error} `P13_RECORD_INVALID` / `P13_RECORD_LIMIT` / asset and amount codes.
 */
export function decodeRecord(bytes: Uint8Array): ConfidentialRecordV1 {
  check(bytes.length <= MAX_RECORD_BYTES, 'P13_RECORD_LIMIT', 'record too large');
  let text: string;
  let raw: unknown;
  try {
    // ignoreBOM keeps a leading U+FEFF in the text, so a BOM-prefixed record fails the strict/canonical checks.
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    raw = parseStrictJson(text);
  } catch {
    return fail('P13_RECORD_INVALID', 'record is not strict JSON');
  }
  const r = exactRecord(
    raw,
    ['schema', 'recordId', 'revision', 'state', 'protocolId', 'asset', 'assetDigest', 'invoiceDigest', 'planDigest',
      'feePolicy', 'amounts', 'sessionEpoch', 'createdAt', 'updatedAt'],
    ['evidence'],
    'P13_RECORD_INVALID',
  );
  check(r['schema'] === 'ghostpay.confidential-record/v1', 'P13_RECORD_INVALID', 'unknown record schema');
  const state = r['state'];
  check(isP13State(state), 'P13_RECORD_INVALID', 'invalid state');
  const asset = decodeConfidentialAsset(r['asset']);
  check(r['protocolId'] === asset.protocolId, 'P13_RECORD_INVALID', 'protocol mismatch');
  const digest = assertDigest(r['assetDigest']);
  check(digest === assetDigest(asset), 'P13_RECORD_INVALID', 'asset digest mismatch');
  const feePolicy = r['feePolicy'];
  check(feePolicy === 'payer_pays' || feePolicy === 'seller_pays', 'P13_RECORD_INVALID', 'invalid fee policy');
  const a = exactRecord(r['amounts'], ['gross', 'fee', 'net'], [], 'P13_RECORD_INVALID');
  const gross = parseDecimalUnits(a['gross']);
  const split = confidentialRouterSplit(gross);
  check(
    parseDecimalUnits(a['fee']) === split.fee && parseDecimalUnits(a['net']) === split.net,
    'P13_CONSERVATION',
    'stored amounts do not match the router split',
  );
  const createdAt = intIn(r['createdAt'], 0, MAX_TIME, 'P13_RECORD_INVALID');
  const updatedAt = intIn(r['updatedAt'], createdAt, MAX_TIME, 'P13_RECORD_INVALID');
  const record: ConfidentialRecordV1 = {
    schema: 'ghostpay.confidential-record/v1',
    recordId: matchString(r['recordId'], RECORD_ID_RE, 'P13_RECORD_INVALID'),
    revision: intIn(r['revision'], 1, MAX_REVISION, 'P13_RECORD_INVALID'),
    state,
    protocolId: asset.protocolId,
    asset,
    assetDigest: digest,
    invoiceDigest: matchString(r['invoiceDigest'], KECCAK_RE, 'P13_RECORD_INVALID'),
    planDigest: matchString(r['planDigest'], SHA_RE, 'P13_RECORD_INVALID'),
    feePolicy,
    amounts: amountsFromGross(gross),
    sessionEpoch: intIn(r['sessionEpoch'], 0, Number.MAX_SAFE_INTEGER, 'P13_RECORD_INVALID'),
    createdAt,
    updatedAt,
    ...(r['evidence'] !== undefined ? { evidence: decodeEvidence(r['evidence']) } : {}),
  };
  const canonical = canonicalize(toJson(record));
  check(canonical === text, 'P13_RECORD_INVALID', 'record is not in canonical form');
  return record;
}
