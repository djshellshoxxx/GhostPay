import type { Address, Hex } from 'viem';
import type { PayerHidingDeployment } from '../manifest.js';
import type { RouterTarget } from '../routerTargets.js';
import type { RelayPayIntent, RelayPermit } from '../relay/intent.js';
import type { DelegatePayIntent } from '../eip7702/intent.js';
import type { PackedUserOperation } from '../erc4337/userop.js';

/** Modes the sponsor serves. */
export type SponsoredMode = 'permit-relay' | 'eip7702-sponsored' | 'erc4337-paymaster';

/** A signed EIP-7702 authorization tuple as sent by the payer. */
export interface SignedAuthorizationWire {
  readonly chainId: number;
  readonly address: Address;
  readonly nonce: number;
  readonly r: Hex;
  readonly s: Hex;
  readonly yParity: number;
}

/** A transaction the sponsor sends (always from its own hot key). */
export interface SponsorCall {
  readonly to: Address;
  readonly data: Hex;
  readonly authorizationList?: readonly SignedAuthorizationWire[];
}

/** Receipt facts the sponsor needs. */
export interface SponsorReceipt {
  readonly success: boolean;
  readonly gasUsed: bigint;
  readonly effectiveGasPrice: bigint;
  /** Logs of the transaction (used to confirm the sponsor fee was actually paid). */
  readonly logs: readonly ReceiptLog[];
}

/** A receipt log. */
export interface ReceiptLog {
  readonly address: Address;
  readonly topics: readonly Hex[];
  readonly data: Hex;
}

/** Port to one chain, implemented over viem in `viemChain.ts` and faked in tests. */
export interface SponsorChain {
  readonly chainId: number;
  /** The sponsor hot-key address (tx sender, bundler beneficiary). */
  readonly sponsorAddress: Address;
  gasPrice(): Promise<bigint>;
  /** `eth_call` returning the raw result (reads such as `factory.getAddress`). */
  call(to: Address, data: Hex): Promise<Hex>;
  /** Simulates `call` from the sponsor address; `gas` is the estimate when it would succeed. */
  simulate(call: SponsorCall): Promise<{ readonly ok: true; readonly gas: bigint } | { readonly ok: false }>;
  send(call: SponsorCall, gasLimit: bigint): Promise<Hex>;
  waitForReceipt(hash: Hex): Promise<SponsorReceipt>;
  getCode(address: Address): Promise<Hex | undefined>;
}

/** Per-chain sponsor configuration. */
export interface ChainSponsorConfig {
  readonly chain: SponsorChain;
  readonly deployment: PayerHidingDeployment;
  /** Routers the sponsor is willing to call (address + kind). */
  readonly routers: readonly RouterTarget[];
  /** Tokens the sponsor accepts as payment. */
  readonly tokens: readonly Address[];
  /** Where sponsor fees are paid. */
  readonly sponsorFeeTo: Address;
}

/** Token base units per 1e18 wei of native gas, for `token` on `chainId`. Injected price source. */
export type PriceSource = (chainId: number, token: Address) => Promise<bigint>;

/** Signs the 32-byte paymaster hash with EIP-191 personal-sign wrapping (`signMessage({message:{raw}})`). */
export type PaymasterSigner = (hash: Hex) => Promise<Hex>;

/** Caller context derived from the client address (never logged). */
export interface ClientContext {
  /** Rate-limit and loss-budget key (canonical IPv4 /32 or IPv6 /64 bucket). */
  readonly bucket: string;
}

/** `POST /v1/quote` input. */
export interface QuoteRequest {
  readonly mode: SponsoredMode;
  readonly chainId: number;
  readonly token: Address;
  readonly gross: bigint;
}

/** `POST /v1/quote` output. */
export interface Quote {
  readonly quoteId: string;
  readonly sponsorFee: bigint;
  readonly sponsorFeeTo: Address;
  readonly expiresAt: number;
}

/** PH-2 submit. */
export interface RelaySubmitRequest {
  readonly quoteId: string;
  readonly chainId: number;
  readonly router: RouterTarget;
  readonly intent: RelayPayIntent;
  readonly routerCalldata: Hex;
  readonly sig: Hex;
  readonly permit: RelayPermit;
}

/** PH-3 submit. */
export interface Eip7702SubmitRequest {
  readonly quoteId: string;
  readonly chainId: number;
  readonly payer: Address;
  readonly router: RouterTarget;
  readonly intent: DelegatePayIntent;
  readonly routerCalldata: Hex;
  readonly sig: Hex;
  readonly authorization: SignedAuthorizationWire;
}

/** PH-4 step 1: ask the sponsor to authorise gas for an (unsigned) operation. */
export interface SponsorUserOpRequest {
  readonly quoteId: string;
  readonly chainId: number;
  readonly router: RouterTarget;
  readonly routerCalldata: Hex;
  readonly owner: Address;
  readonly saltNonce: bigint;
  readonly sponsorFee: bigint;
  readonly userOp: PackedUserOperation;
}

/** PH-4 step 1 result. */
export interface SponsorUserOpResponse {
  readonly paymasterAndData: Hex;
  readonly validUntil: bigint;
}

/** PH-4 step 2: submit the owner-signed, paymaster-sponsored operation. */
export interface SubmitUserOpRequest extends SponsorUserOpRequest {
  /** Operation with `paymasterAndData` from step 1 and the owner's signature. */
  readonly userOp: PackedUserOperation;
}

/** Outcome of a submit. */
export interface SubmitResult {
  readonly txHash: Hex;
}
