/**
 * Shared types for payment presets and pay-again.
 * @security Pure data types. No I/O, no clocks, no network. Amounts are bigint base units; no floats.
 */

export type PresetErrorCode =
  | 'invalid-preset'
  | 'invalid-record'
  | 'invalid-context'
  | 'invalid-amount'
  | 'invalid-address'
  | 'chain-mismatch'
  | 'asset-mismatch'
  | 'payee-mismatch'
  | 'bad-key'
  | 'limit-exceeded'
  | 'not-found'
  | 'storage-failed'
  | 'decrypt-failed';

export interface PresetError {
  readonly code: PresetErrorCode;
  readonly message: string;
}

export type Result<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: PresetError };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const err = <T = never>(code: PresetErrorCode, message: string): Result<T> => ({
  ok: false,
  error: { code, message },
});

/** How the amount of a preset is determined. */
export type AmountRule =
  | { readonly kind: 'fixed'; readonly amount: bigint }
  | { readonly kind: 'ask' }
  | { readonly kind: 'up-to'; readonly max: bigint };

/**
 * A saved payment preset.
 * `payeeRef` is an opaque address-book reference, never a raw address: the
 * address is resolved (and risk-checked) at use time.
 */
export interface Preset {
  readonly id: string;
  readonly label: string;
  readonly payeeRef: string;
  /** CAIP-2 style chain id, e.g. `eip155:1`. */
  readonly chain: string;
  /** `native` or `<chain>/<namespace>:<reference>`. */
  readonly asset: string;
  readonly amountRule: AmountRule;
  /** Slug naming a privacy profile defined elsewhere (e.g. `standard`). */
  readonly privacyProfile: string;
  readonly memo: string;
  /** Unix ms. */
  readonly createdAt: number;
  readonly updatedAt: number;
}

export type AddressRisk = 'none' | 'low' | 'medium' | 'high' | 'unknown';

/** A past (completed) payment as remembered locally. */
export interface PaymentRecord {
  readonly id: string;
  readonly payeeRef: string;
  /** Recipient address as paid then. Opaque, chain-specific string. */
  readonly address: string;
  readonly chain: string;
  readonly asset: string;
  readonly amount: bigint;
  /** Fee actually paid, base units of the chain's fee asset. */
  readonly fee: bigint;
  readonly privacyProfile: string;
  readonly memo: string;
  /** Risk assessment of `address` at the time of payment. */
  readonly addressRisk: AddressRisk;
  /** Unix ms. */
  readonly paidAt: number;
}

/** Facts about the present, supplied by the caller (all injected, nothing fetched here). */
export interface PayContext {
  /** Unix ms from an injected clock. */
  readonly now: number;
  /** Address the payee ref resolves to right now (null if the ref no longer resolves). */
  readonly resolvedAddress: string | null;
  /** Current risk assessment for `resolvedAddress`. */
  readonly addressRisk: AddressRisk;
  /** Freshly quoted fee, base units; null if no quote is available. */
  readonly quotedFee: bigint | null;
  /** Chain-specific address syntax check. Must be pure and must not throw on bad input. */
  readonly validateAddress: (chain: string, address: string) => boolean;
  /** Chains/assets the wallet currently supports; omit to skip the check. */
  readonly supported?: (chain: string, asset: string) => boolean;
}

export interface PayAgainOptions {
  /** Fee change tolerance in basis points before a `fee-changed` warning (default 500 = 5%). */
  readonly feeToleranceBps?: number;
  /** Records older than this (ms) raise `record-stale` (default 90 days). */
  readonly staleAfterMs?: number;
}

export type FlagSeverity = 'info' | 'warn' | 'block';

export type FlagCode =
  | 'fee-changed'
  | 'fee-unavailable'
  | 'address-changed'
  | 'address-risk-increased'
  | 'address-risk-high'
  | 'address-risk-unknown'
  | 'record-stale';

export interface DraftFlag {
  readonly code: FlagCode;
  readonly severity: FlagSeverity;
  readonly detail?: Readonly<Record<string, string>>;
}

/**
 * A prefilled, NOT sent payment. `autoSend` is the literal `false` and
 * `requiresReview` the literal `true`: the UI must show a full review step.
 * `blocked` means a `block` flag exists; the user must change something
 * (e.g. re-pick the payee) rather than just confirm.
 */
export interface PaymentDraft {
  readonly autoSend: false;
  readonly requiresReview: true;
  readonly blocked: boolean;
  readonly payeeRef: string;
  readonly address: string;
  readonly chain: string;
  readonly asset: string;
  /** null when the preset's rule is `ask` and no amount was supplied yet. */
  readonly amount: bigint | null;
  readonly maxAmount: bigint | null;
  readonly fee: bigint | null;
  readonly privacyProfile: string;
  readonly memo: string;
  readonly flags: readonly DraftFlag[];
  readonly source: { readonly kind: 'record' | 'preset'; readonly id: string };
}
