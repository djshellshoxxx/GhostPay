import { fail } from './errors.js';
import { parseSolanaAddress } from './addresses.js';
import { parseDecimal, toAtomic, type Decimal } from './decimal.js';
import { buildQuery, parseQuery, splitUri } from './query.js';
import { recipientInfo, type RecipientInfo } from './recipient.js';
import { checkText, hasMixedScript, MAX_LABEL_BYTES, MAX_MEMO_BYTES, MAX_MESSAGE_BYTES } from './text.js';

const U64_MAX = (1n << 64n) - 1n;
const MAX_SCALE = 18;
const MAX_REFERENCES = 8;
const BOUND = U64_MAX * 10n ** BigInt(MAX_SCALE);

/** Parsed Solana Pay transfer request. */
export interface SolanaTransferRequest {
  readonly recipient: RecipientInfo;
  /** Amount in whole token units (SOL when `splToken` is absent). Convert with {@link solanaAtomic}. */
  readonly amount?: Decimal;
  readonly splToken?: RecipientInfo;
  readonly references: readonly string[];
  /** Plain text. Render with textContent only. */
  readonly label?: string;
  readonly message?: string;
  /** Recorded on chain by the payer's wallet; plain text. */
  readonly memo?: string;
  readonly mixedScriptText: boolean;
}

/**
 * Converts the parsed amount to atomic units (lamports for SOL = 9 decimals, or the mint's decimals).
 * Rejects excess precision and values above u64::MAX.
 */
export function solanaAtomic(amount: Decimal, decimals: number): bigint {
  const v = toAtomic(amount, decimals);
  if (v > U64_MAX) return fail('AMOUNT_OVERFLOW');
  return v;
}

/**
 * Strict Solana Pay transfer-request parser (`solana:<recipient>?amount&spl-token&reference&label&message&memo`).
 * Transaction-request links (`solana:https%3A...`) are rejected as unsupported. Amounts are non-negative decimals
 * (zero rejected), never floats. `reference` may repeat (max 8, no repeats of the same key); everything else may not.
 * Unknown parameters are rejected (the spec defines no required/optional extension mechanism).
 */
export function parseSolanaPay(uri: string): SolanaTransferRequest {
  const { scheme, rest, query } = splitUri(uri);
  if (scheme !== 'solana') return fail('INVALID_SCHEME');
  if (/[:%/]/.test(rest)) return fail('UNSUPPORTED');
  const recipient = parseSolanaAddress(rest);
  const params = query === undefined ? [] : parseQuery(query, { foldKeys: true, repeatable: new Set(['reference']) });
  const refs: string[] = [];
  const v = new Map<string, string>();
  for (const p of params) {
    if (p.key === 'reference') {
      const r = parseSolanaAddress(p.value);
      if (refs.includes(r) || refs.length >= MAX_REFERENCES) return fail('INVALID_QUERY');
      refs.push(r);
    } else if (['amount', 'spl-token', 'label', 'message', 'memo'].includes(p.key)) v.set(p.key, p.value);
    else return fail('UNKNOWN_REQUIRED_PARAM');
  }
  const amount = v.has('amount') ? parseDecimal(v.get('amount')!, MAX_SCALE, BOUND) : undefined;
  const splToken = v.has('spl-token') ? recipientInfo('solana', parseSolanaAddress(v.get('spl-token')!)) : undefined;
  const label = v.has('label') ? checkText(v.get('label'), MAX_LABEL_BYTES) : undefined;
  const message = v.has('message') ? checkText(v.get('message'), MAX_MESSAGE_BYTES) : undefined;
  const memo = v.has('memo') ? checkText(v.get('memo'), MAX_MEMO_BYTES) : undefined;
  return {
    recipient: recipientInfo('solana', recipient),
    ...(amount === undefined ? {} : { amount }),
    ...(splToken === undefined ? {} : { splToken }),
    references: refs,
    ...(label === undefined ? {} : { label }),
    ...(message === undefined ? {} : { message }),
    ...(memo === undefined ? {} : { memo }),
    mixedScriptText: [label, message, memo].some((t) => t !== undefined && hasMixedScript(t)),
  };
}

/** Parameters for {@link buildSolanaPay}. */
export interface BuildSolanaParams {
  readonly recipient: string;
  /** Decimal string in whole token units, e.g. `"1.5"`. */
  readonly amount?: string;
  readonly splToken?: string;
  readonly references?: readonly string[];
  readonly label?: string;
  readonly message?: string;
  readonly memo?: string;
}

/** Builds a Solana Pay transfer-request URI. Output re-parses to the same values. */
export function buildSolanaPay(p: BuildSolanaParams): string {
  const pairs: [string, string][] = [];
  if (p.amount !== undefined) pairs.push(['amount', parseDecimal(p.amount, MAX_SCALE, BOUND).canonical]);
  if (p.splToken !== undefined) pairs.push(['spl-token', parseSolanaAddress(p.splToken)]);
  const refs = p.references ?? [];
  if (refs.length > MAX_REFERENCES || new Set(refs).size !== refs.length) return fail('INVALID_QUERY');
  for (const r of refs) pairs.push(['reference', parseSolanaAddress(r)]);
  if (p.label !== undefined) pairs.push(['label', checkText(p.label, MAX_LABEL_BYTES)]);
  if (p.message !== undefined) pairs.push(['message', checkText(p.message, MAX_MESSAGE_BYTES)]);
  if (p.memo !== undefined) pairs.push(['memo', checkText(p.memo, MAX_MEMO_BYTES)]);
  const head = `solana:${parseSolanaAddress(p.recipient)}`;
  return pairs.length === 0 ? head : `${head}?${buildQuery(pairs)}`;
}
