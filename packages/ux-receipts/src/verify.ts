import { matchesAddress } from './address.js';
import { digestBody } from './digest.js';
import type { ReceiptIssue } from './errors.js';
import { parseReceipt } from './parse.js';
import type { Receipt } from './types.js';

/** Facts a chain lookup can return about a transaction. All optional: adapters report what they know. */
export interface ChainFacts {
  readonly confirmed: boolean;
  readonly amountBase?: string;
  readonly assetSymbol?: string;
  readonly sender?: string;
  readonly recipient?: string;
}

export type ChainLookupResult =
  | { readonly status: 'found'; readonly facts: ChainFacts }
  | { readonly status: 'not_found' }
  | { readonly status: 'unavailable' };

/**
 * Injected chain lookup. The receipts package performs NO network access itself.
 * @security Implementations must not send the receipt (memo, digest) anywhere; only
 * chain + txHash are needed. A lookup reveals to the RPC provider that you are checking that tx.
 */
export interface ChainVerifier {
  lookup(query: { readonly chain: string; readonly txHash: string }): Promise<ChainLookupResult>;
}

export type ChainStatus =
  | 'not_checked' // no verifier injected
  | 'not_checkable' // receipt lacks chain or txHash
  | 'confirmed'
  | 'tx_exists_only' // tx found+confirmed but no revealed field could be compared
  | 'unconfirmed'
  | 'mismatch'
  | 'not_found'
  | 'unavailable';

export type Verdict = 'invalid' | 'self_consistent_unverified' | 'chain_confirmed' | 'chain_problem';

export interface VerificationReport {
  readonly verdict: Verdict;
  /** Shape/digest/time problems; empty when self-consistent. */
  readonly issues: readonly ReceiptIssue[];
  readonly selfConsistent: boolean;
  readonly chain: {
    readonly status: ChainStatus;
    readonly mismatches: readonly string[];
    readonly matched: readonly string[];
  };
  /** Honest limits to show next to the verdict. */
  readonly caveats: readonly string[];
}

export interface VerifyOptions {
  readonly verifier?: ChainVerifier;
  /** Injected "now" (epoch ms). If given, receipts dated more than `maxSkewMs` ahead are flagged. */
  readonly nowMs?: number;
  readonly maxSkewMs?: number;
}

const DEFAULT_SKEW_MS = 5 * 60 * 1000;

/**
 * Verify a received receipt.
 * Self-consistency (strict shape, digest recomputation, sane date) proves only that the
 * text was not accidentally altered; it proves NOTHING about whether a payment happened,
 * because there is no signature. Corroboration needs an injected ChainVerifier and a
 * receipt revealing both chain and txHash.
 * @security Untrusted input. Verifier failures/throws degrade to `unavailable`, never to success.
 */
export async function verifyReceipt(input: unknown, opts: VerifyOptions = {}): Promise<VerificationReport> {
  const caveats = ['digest_not_signature'];
  const parsed = parseReceipt(input);
  if (!parsed.ok) {
    return {
      verdict: 'invalid',
      issues: parsed.issues,
      selfConsistent: false,
      chain: { status: 'not_checked', mismatches: [], matched: [] },
      caveats,
    };
  }
  // Keep the digest, date checks and asynchronous lookup on one receipt snapshot.
  const { asset, digest: originalDigest, redacted, ...fields } = parsed.receipt;
  const r: Receipt = {
    ...fields,
    ...(asset === undefined ? {} : { asset: { ...asset } }),
    redacted: [...redacted],
    digest: { ...originalDigest },
  };
  const issues: ReceiptIssue[] = [];
  const { digest, ...body } = r;
  if ((await digestBody(body)) !== digest.hex) {
    issues.push({ code: 'INVALID_FIELD', path: 'digest', message: 'digest does not match content' });
  }
  if (opts.nowMs !== undefined && r.createdAt !== undefined) {
    const t = Date.parse(r.createdAt.length === 10 ? r.createdAt + 'T00:00:00.000Z' : r.createdAt);
    if (t > opts.nowMs + (opts.maxSkewMs ?? DEFAULT_SKEW_MS)) {
      issues.push({ code: 'INVALID_FIELD', path: 'createdAt', message: 'receipt is dated in the future' });
    }
  }
  if (issues.length > 0) {
    return {
      verdict: 'invalid',
      issues,
      selfConsistent: false,
      chain: { status: 'not_checked', mismatches: [], matched: [] },
      caveats,
    };
  }

  const chain = await checkChain(r, opts.verifier);
  let verdict: Verdict = 'self_consistent_unverified';
  if (chain.status === 'confirmed') verdict = 'chain_confirmed';
  else if (['mismatch', 'not_found', 'unconfirmed'].includes(chain.status)) verdict = 'chain_problem';
  if (chain.status === 'unavailable') caveats.push('chain_unavailable');
  if (chain.status === 'not_checkable') caveats.push('not_chain_checkable');
  if (chain.status === 'not_checked') caveats.push('chain_not_checked');
  if (chain.status === 'tx_exists_only') caveats.push('tx_exists_but_unmatched');
  return { verdict, issues: [], selfConsistent: true, chain, caveats };
}

async function checkChain(
  r: Receipt,
  verifier: ChainVerifier | undefined,
): Promise<VerificationReport['chain']> {
  const none = (status: ChainStatus): VerificationReport['chain'] => ({
    status,
    mismatches: [],
    matched: [],
  });
  if (verifier === undefined) return none('not_checked');
  if (r.chain === undefined || r.txHash === undefined) return none('not_checkable');
  let res: ChainLookupResult;
  try {
    res = await verifier.lookup({ chain: r.chain, txHash: r.txHash });
  } catch {
    return none('unavailable');
  }
  // An injected lookup can resolve a throwing object or proxy; do not let it reject verification.
  try {
    // A runtime adapter may violate the TypeScript result union; never trust a malformed envelope.
    if (typeof res !== 'object' || res === null || Array.isArray(res)) return none('unavailable');
    // RCPT-L2: read each adapter-controlled accessor exactly once; every later check uses the snapshot.
    const envelope = res as { readonly status?: unknown; readonly facts?: unknown };
    const status = envelope.status;
    if (status === 'unavailable') return none('unavailable');
    if (status === 'not_found') return none('not_found');
    if (status !== 'found') return none('unavailable');
    const f = envelope.facts;
    if (typeof f !== 'object' || f === null || Array.isArray(f)) return none('unavailable');
    const facts = f as Partial<Record<keyof ChainFacts, unknown>>;
    const confirmed = facts.confirmed;
    const amountBase = facts.amountBase;
    const assetSymbol = facts.assetSymbol;
    const sender = facts.sender;
    const recipient = facts.recipient;
    if (typeof confirmed !== 'boolean') return none('unavailable');
    // Malformed optional evidence must not be mistaken for a valid match or throw during address comparisons.
    if (
      (amountBase !== undefined && typeof amountBase !== 'string') ||
      (assetSymbol !== undefined && typeof assetSymbol !== 'string') ||
      (sender !== undefined && typeof sender !== 'string') ||
      (recipient !== undefined && typeof recipient !== 'string')
    ) {
      return none('unavailable');
    }
    const matched: string[] = [];
    const mismatches: string[] = [];
    const cmp = (name: string, ok: boolean | undefined): void => {
      if (ok === undefined) return;
      (ok ? matched : mismatches).push(name);
    };
    cmp('amount', r.amount !== undefined && amountBase !== undefined ? r.amount === amountBase : undefined);
    cmp('asset', r.asset !== undefined && assetSymbol !== undefined ? r.asset.symbol === assetSymbol : undefined);
    cmp('sender', r.sender !== undefined && sender !== undefined ? matchesAddress(r.sender, sender) : undefined);
    cmp(
      'recipient',
      r.recipient !== undefined && recipient !== undefined ? matchesAddress(r.recipient, recipient) : undefined,
    );
    if (mismatches.length > 0) return { status: 'mismatch', mismatches, matched };
    if (!confirmed) return { status: 'unconfirmed', mismatches, matched };
    return { status: matched.length > 0 ? 'confirmed' : 'tx_exists_only', mismatches, matched };
  } catch {
    return none('unavailable');
  }
}
