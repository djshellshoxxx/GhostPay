/** Receipt document version. */
export const RECEIPT_VERSION = 1 as const;
/** Receipt document type tag. */
export const RECEIPT_TYPE = 'ghostpay.receipt' as const;

/** Fields a policy can withhold. Asset travels with amount. */
export const REDACTABLE_FIELDS = [
  'time',
  'chain',
  'amount',
  'memo',
  'txHash',
  'sender',
  'recipient',
] as const;
export type RedactableField = (typeof REDACTABLE_FIELDS)[number];

export interface AssetInfo {
  /** Ticker, `^[A-Za-z0-9]{1,12}$`. */
  readonly symbol: string;
  /** Decimals of the base unit, integer 0..36. */
  readonly decimals: number;
}

export type RecipientKind = 'stealth' | 'public';

/**
 * Local, private payment record the receipt is derived from.
 * @security This type deliberately has NO key material fields. Extra properties
 * (spending/viewing/stealth keys, seeds) are rejected at runtime with FORBIDDEN_FIELD.
 */
export interface PaymentRecord {
  /** Exact UTC instant, `new Date().toISOString()` form (with milliseconds). */
  readonly createdAt: string;
  /** CAIP-2 chain id, e.g. `eip155:8453`. */
  readonly chain: string;
  readonly asset: AssetInfo;
  /** Positive integer amount in base units, decimal string. */
  readonly amountBase: string;
  readonly memo?: string;
  /** Lowercase 32-byte hex hash, optional `0x` prefix. */
  readonly txHash: string;
  readonly sender: string;
  readonly recipient: string;
  readonly recipientKind: RecipientKind;
}

/** How to show an address: whole, not at all, or `head...tail`. */
export type AddressForm = 'full' | 'hidden' | { readonly head: number; readonly tail: number };

export type TimeForm = 'exact' | 'day' | 'hidden';

/** What to reveal in a shared receipt. */
export interface DisclosurePolicy {
  readonly time: TimeForm;
  readonly chain: boolean;
  readonly amount: boolean;
  readonly memo: boolean;
  readonly txHash: boolean;
  readonly sender: AddressForm;
  readonly recipient: AddressForm;
}

export interface ReceiptDigest {
  readonly alg: 'SHA-256';
  /** Lowercase hex of SHA-256 over the canonical JSON of the receipt without `digest`. */
  readonly hex: string;
}

/**
 * Shareable receipt. Absent optional field = not revealed. `redacted` lists fields
 * deliberately withheld. A truncated address contains `...`.
 * @security The digest is an integrity checksum, NOT a signature: anyone can fabricate
 * a self-consistent receipt. Only an on-chain lookup (ChainVerifier) can corroborate it.
 */
export interface Receipt {
  readonly v: typeof RECEIPT_VERSION;
  readonly type: typeof RECEIPT_TYPE;
  readonly createdAt?: string;
  readonly chain?: string;
  readonly asset?: AssetInfo;
  readonly amount?: string;
  readonly memo?: string;
  readonly txHash?: string;
  readonly sender?: string;
  readonly recipient?: string;
  readonly redacted: readonly RedactableField[];
  readonly digest: ReceiptDigest;
}
