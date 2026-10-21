import { formatAmount } from './amount.js';
import { canonicalJson } from './canonical.js';
import type { Receipt } from './types.js';
import { sanitizeForDisplay } from './validate.js';

export interface ReceiptLabels {
  readonly title: string;
  readonly amount: string;
  readonly chain: string;
  readonly time: string;
  readonly from: string;
  readonly to: string;
  readonly memo: string;
  readonly tx: string;
  readonly withheld: string;
  readonly digest: string;
  readonly disclaimer: string;
}

/** English defaults; inject translations from ux-i18n. */
export const DEFAULT_LABELS: ReceiptLabels = {
  title: 'GhostPay payment receipt',
  amount: 'Amount',
  chain: 'Chain',
  time: 'Time',
  from: 'From',
  to: 'To',
  memo: 'Memo',
  tx: 'Transaction',
  withheld: 'Withheld',
  digest: 'Digest (SHA-256)',
  disclaimer: 'Unsigned: the digest only detects edits. Verify the transaction on a block explorer.',
};

/**
 * Plain-text share rendering. Output is text only (no markup); untrusted memo characters
 * (control, bidi, zero-width) are replaced.
 * @security Render with textContent / plain share sheets; never as HTML.
 */
export function renderText(r: Receipt, labels: Partial<ReceiptLabels> = {}): string {
  const L = { ...DEFAULT_LABELS, ...labels };
  const out: string[] = [L.title];
  if (r.amount !== undefined && r.asset !== undefined) {
    out.push(
      `${L.amount}: ${formatAmount(r.amount, r.asset.decimals)} ${sanitizeForDisplay(r.asset.symbol)}`,
    );
  }
  if (r.chain !== undefined) out.push(`${L.chain}: ${sanitizeForDisplay(r.chain)}`);
  if (r.createdAt !== undefined) out.push(`${L.time}: ${sanitizeForDisplay(r.createdAt)}`);
  if (r.sender !== undefined) out.push(`${L.from}: ${sanitizeForDisplay(r.sender)}`);
  if (r.recipient !== undefined) out.push(`${L.to}: ${sanitizeForDisplay(r.recipient)}`);
  if (r.memo !== undefined) out.push(`${L.memo}: ${sanitizeForDisplay(r.memo)}`);
  if (r.txHash !== undefined) out.push(`${L.tx}: ${sanitizeForDisplay(r.txHash)}`);
  if (r.redacted.length > 0) out.push(`${L.withheld}: ${r.redacted.join(', ')}`);
  out.push(`${L.digest}: ${r.digest.hex}`);
  out.push(L.disclaimer);
  return out.join('\n');
}

/**
 * JSON share rendering: canonical (compact, sorted keys) by default, so the exact bytes can be
 * re-hashed; `pretty` only changes whitespace (digest still verifies after parsing).
 */
export function renderJson(r: Receipt, opts: { readonly pretty?: boolean } = {}): string {
  const c = canonicalJson(r);
  return opts.pretty === true ? JSON.stringify(JSON.parse(c), null, 2) : c;
}
