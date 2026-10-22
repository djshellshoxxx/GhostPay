import type { Address, Hex } from '@ghostpay/chain-adapters';

export type { Address, Hex };

/** Router entry points that may be reviewed (`payERC20WithBuffer` is deliberately absent, haiku L-04). */
export type RouterPaymentMethod = 'payERC20' | 'payERC20WithPermit' | 'payNative';

/** `GhostPayRouter` payment call. */
export interface RouterPaymentIntent {
  readonly kind: 'router_payment';
  readonly method: RouterPaymentMethod;
  readonly chainId: number;
  readonly router: Address;
  readonly token: Address | 'native';
  readonly stealth: Address;
  readonly gross: bigint;
  readonly minNet: bigint;
  readonly fee: bigint;
  readonly deadline: bigint;
  readonly metadata: Hex;
  readonly ephemeralKey: Hex;
}

/** ERC-20 `approve(spender, amount)` on `token`. */
export interface Erc20ApproveIntent {
  readonly kind: 'erc20_approve';
  readonly chainId: number;
  readonly token: Address;
  readonly spender: Address;
  readonly amount: bigint;
}

/** Direct (self-paid) sweep: native transfer or ERC-20 `transfer(to, amount)`. */
export interface DirectSweepIntent {
  readonly kind: 'direct_sweep';
  readonly chainId: number;
  readonly from: Address;
  readonly token: Address | 'native';
  readonly to: Address;
  readonly amount: bigint;
  readonly maxFeePerGas: bigint;
  readonly maxPriorityFeePerGas: bigint;
  readonly gasLimit: bigint;
}

/** EIP-712 `Sweep` order for `GhostPaySweepRelayer`. */
export interface RelayedSweepSigIntent {
  readonly kind: 'relayed_sweep_sig';
  readonly chainId: number;
  readonly verifyingContract: Address;
  readonly owner: Address;
  readonly token: Address;
  readonly destination: Address;
  readonly amount: bigint;
  readonly fee: bigint;
  readonly feeTo: Address;
  readonly deadline: bigint;
  readonly nonce: bigint;
}

/** EIP-2612 `Permit` message. */
export interface PermitSigIntent {
  readonly kind: 'permit_sig';
  readonly chainId: number;
  readonly token: Address;
  readonly owner: Address;
  readonly spender: Address;
  readonly value: bigint;
  readonly nonce: bigint;
  readonly deadline: bigint;
}

/** Closed set of things this package lets a user sign. */
export type Intent =
  | RouterPaymentIntent
  | Erc20ApproveIntent
  | DirectSweepIntent
  | RelayedSweepSigIntent
  | PermitSigIntent;

/** Reasons the decoder itself can fail with. */
export type DecodeFailureCode =
  | 'UNKNOWN_SELECTOR'
  | 'MALFORMED_CALLDATA'
  | 'TRAILING_BYTES'
  | 'NON_CANONICAL_CALLDATA'
  | 'VALUE_UNEXPECTED'
  | 'BUFFER_PAYMENT_UNSUPPORTED'
  | 'INVALID_PAYMENT'
  | 'INVALID_TX_FIELD'
  | 'UNSUPPORTED_TX_FEATURE'
  | 'MISSING_TX_FIELD'
  | 'UNKNOWN_TYPED_DATA'
  | 'INVALID_TYPED_DATA';

/** Result of a decode that did not produce an {@link Intent}. */
export interface UnknownIntent {
  readonly kind: 'unknown';
  readonly reason: DecodeFailureCode;
}

/** Field-mismatch reasons (`expected` differs from the decoded bytes in exactly this field). */
export type MismatchCode =
  | 'CHAIN_MISMATCH'
  | 'MISMATCH_KIND'
  | 'MISMATCH_METHOD'
  | 'MISMATCH_ROUTER'
  | 'MISMATCH_TOKEN'
  | 'MISMATCH_STEALTH'
  | 'MISMATCH_GROSS'
  | 'MISMATCH_MIN_NET'
  | 'MISMATCH_FEE'
  | 'MISMATCH_DEADLINE'
  | 'MISMATCH_METADATA'
  | 'MISMATCH_EPHEMERAL_KEY'
  | 'MISMATCH_SPENDER'
  | 'MISMATCH_AMOUNT'
  | 'MISMATCH_FROM'
  | 'MISMATCH_TO'
  | 'MISMATCH_MAX_FEE_PER_GAS'
  | 'MISMATCH_MAX_PRIORITY_FEE_PER_GAS'
  | 'MISMATCH_GAS_LIMIT'
  | 'MISMATCH_VERIFYING_CONTRACT'
  | 'MISMATCH_OWNER'
  | 'MISMATCH_DESTINATION'
  | 'MISMATCH_FEE_TO'
  | 'MISMATCH_VALUE'
  | 'MISMATCH_NONCE';

/** Policy reasons (rules of the spec's section 2). */
export type PolicyCode =
  | 'UNKNOWN_TO'
  | 'TOKEN_NOT_ALLOWLISTED'
  | 'SPENDER_NOT_ROUTER'
  | 'SPENDER_NOT_MANIFEST'
  | 'APPROVE_EXCEEDS_GROSS'
  | 'APPROVE_WITHOUT_PAYMENT'
  | 'FEE_PER_GAS_ABOVE_CAP'
  | 'GAS_LIMIT_ABOVE_CAP'
  | 'FEE_SHARE_ABOVE_CAP'
  | 'DEADLINE_BEYOND_POLICY'
  | 'DEADLINE_EXPIRED'
  | 'FEE_RECIPIENT_MISMATCH'
  | 'DESTINATION_IS_PROTOCOL_CONTRACT';

/** Every machine-readable refusal reason. */
export type ReasonCode = DecodeFailureCode | MismatchCode | PolicyCode;

/** Review verdict. */
export type ReviewResult = { readonly ok: true } | { readonly ok: false; readonly reasons: readonly ReasonCode[] };

/** Manifest-derived contract addresses (authenticated manifest only). */
export interface PolicyContracts {
  readonly router: Address;
  readonly sweepRelayer: Address;
  readonly announcer: Address;
}

/** Review policy. All amounts in base units, `maxDeadlineSeconds` relative to `now`. */
export interface ReviewPolicy {
  /** Token allowlist per chain id. */
  readonly tokens: ReadonlyMap<number, ReadonlySet<string>>;
  readonly contracts: PolicyContracts;
  readonly feeCaps: {
    readonly maxFeePerGasWei: bigint;
    /** Upper bound of `maxFeePerGas * gasLimit` for direct sweeps (not in the spec; see DEVIATIONS.md). */
    readonly maxGasLimit: bigint;
    /** Cap of fee / amount in basis points. */
    readonly maxFeeShareBps: number;
  };
  /** Relayed sweeps: `feeTo` must equal it. */
  readonly feeRecipient: Address;
  readonly maxDeadlineSeconds: number;
}

/** Extra facts a review may need from the surrounding flow. */
export interface ReviewContext {
  /** Gross amount of the payment this approval belongs to (S3-19). */
  readonly paymentGross?: bigint;
}

/** Unsigned transaction as the wallet or local signer would sign it. */
export interface TxInput {
  readonly chainId: number;
  readonly to: string;
  readonly data: string;
  readonly value: bigint;
  /** Required for `direct_sweep`. */
  readonly from?: string;
  /** Required for `direct_sweep`. */
  readonly maxFeePerGas?: bigint;
  /** Required for `direct_sweep`. */
  readonly maxPriorityFeePerGas?: bigint;
  /** Required for `direct_sweep`. */
  readonly gasLimit?: bigint;
  /** EIP-7702 authorization list; any value (even empty) makes the decode `UNSUPPORTED_TX_FEATURE`. */
  readonly authorizationList?: unknown;
}

/** EIP-712 payload as passed to `eth_signTypedData_v4` / viem `signTypedData` (without `EIP712Domain` in `types`). */
export interface TypedDataInput {
  readonly domain: Readonly<Record<string, unknown>>;
  readonly types: Readonly<Record<string, readonly { readonly name: string; readonly type: string }[]>>;
  readonly primaryType: string;
  readonly message: Readonly<Record<string, unknown>>;
}
