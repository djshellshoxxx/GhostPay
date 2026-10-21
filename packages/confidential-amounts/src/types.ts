import type { Address, Hex } from 'viem';

/** Confidential-amount backend identifiers (spec section 1). `ct2`/`ct3` are spike-gated and not implemented here. */
export type CtBackendId = 'ct1-zama' | 'ct2-fhenix' | 'ct3-inco' | 'ctm-cleartext';

/** Static description of a backend, used by the UI for consent and by tests for honesty checks. */
export interface CtBackendInfo {
  /** Backend id. */
  readonly id: CtBackendId;
  /** Chain ids the backend may be used on (all testnets). */
  readonly chains: readonly number[];
  /** Who must be trusted for confidentiality. */
  readonly trust: 'threshold-kms' | 'fhe-network' | 'tee' | 'none';
  /** `testnet` = real network, `test-double` = local simulation, `spike` = not built. */
  readonly maturity: 'testnet' | 'test-double' | 'spike';
  /** Licence of the backend's third-party code. */
  readonly licence: string;
  /** Origin of the hosted decryption relayer, or null if none is contacted. */
  readonly relayerOrigin: string | null;
  /** Copy keys for what the option hides. */
  readonly whatItHides: readonly string[];
  /** Copy keys for what it does NOT hide; must include every applicable spec section-2 key. */
  readonly whatItDoesNotHide: readonly string[];
}

/** Parameters of a confidential checkout payment (spec 6.5). */
export interface CtPayParams {
  /** Chain id of the payment. */
  readonly chainId: number;
  /** `GhostPayConfidentialRouter` address. */
  readonly router: Address;
  /** Confidential (ERC-7984) token address. */
  readonly token: Address;
  /** One-time stealth address of the seller. */
  readonly stealth: Address;
  /** Gross amount in token base units (1 to 2^64-1). */
  readonly gross: bigint;
  /** Latest valid unix timestamp (seconds). */
  readonly deadline: bigint;
  /** ETH gas buffer forwarded to the stealth address, in wei (also the `maxBufferWei` guard). */
  readonly bufferWei: bigint;
  /** 33-byte compressed ephemeral public key. */
  readonly ephemeralPubKey: Hex;
  /** ERC-5564 view tag, 0..255. */
  readonly viewTag: number;
  /** Payer address (the transaction sender). */
  readonly payer: Address;
}

/** Unsigned transaction request produced by a backend. */
export interface CtTx {
  /** Target contract. */
  readonly to: Address;
  /** ABI-encoded calldata. */
  readonly data: Hex;
  /** ETH value in wei. */
  readonly value: bigint;
}

/**
 * Scoped access to a one-time stealth key. The key is only ever handed to `fn` and must not be
 * retained; implementations should wipe it when `fn` settles (see `@ghostpay/secret-box`).
 */
export interface StealthSigner {
  /** The stealth address (the ACL-allowed owner of the handle). */
  readonly address: Address;
  /** Runs `fn` with the private key; the key must not escape `fn`. */
  readonly withKey: <T>(fn: (privateKey: Hex) => Promise<T>) => Promise<T>;
}

/** Result of encrypting an amount client-side. */
export interface CtEncryptedInput {
  /** 32-byte handle (`externalEuint64`). */
  readonly handle: Hex;
  /** Zero-knowledge input proof. */
  readonly inputProof: Hex;
}

/** Backend-neutral interface (spec section 6.5). Every method refuses non-testnet chains. */
export interface ConfidentialBackend {
  /** Static description. */
  readonly info: CtBackendInfo;
  /** Encrypts `amount` for `contract` as `user`; plaintext never leaves the process. */
  encryptAmount(p: { chainId: number; contract: Address; user: Address; amount: bigint }): Promise<CtEncryptedInput>;
  /** Encrypts the gross amount and builds the `payConfidential` transaction. */
  buildPayCalldata(p: CtPayParams): Promise<CtTx>;
  /** Builds `setOperator(operator, until)`; `until` must be within 900 s of `nowSec` (CT-PAY-2). */
  buildSetOperator(p: { chainId: number; token: Address; operator: Address; until: number; nowSec: number }): CtTx;
  /** Decrypts one handle owned by one stealth address (CT-DEC-1). */
  userDecrypt(p: { chainId: number; contract: Address; handle: Hex; signer: StealthSigner }): Promise<bigint>;
  /** Builds `confidentialTransfer(to, handle)`. */
  buildConfidentialTransfer(p: { chainId: number; token: Address; to: Address; amountHandle: Hex }): CtTx;
  /** Builds `unwrap(from, to, handle)` (starts a public-amount unwrap). */
  buildUnwrap(p: { chainId: number; token: Address; from: Address; to: Address; amountHandle: Hex }): CtTx;
  /** Fetches the public decryption proof and builds `finalizeUnwrap`. */
  finalizeUnwrap(p: { chainId: number; token: Address; requestId: Hex }): Promise<CtTx>;
}
