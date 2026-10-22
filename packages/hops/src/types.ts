import type { Address, Hex, PermitReader } from '@ghostpay/chain-adapters';
import type { SecretScalar } from '@ghostpay/core-crypto';

export type { Address, Hex };

/** Chain ids this package will touch. Anything else throws `MAINNET_FORBIDDEN`. */
export const TESTNET_CHAIN_IDS = [11155111, 84532, 31337] as const;

/** Stable error codes. Messages are fixed text and never carry addresses, amounts or keys. */
export type HopErrorCode =
  | 'MAINNET_FORBIDDEN'
  | 'NO_PERMIT'
  | 'NOT_ACKED'
  | 'FEE_CAP'
  | 'AMOUNT_TOO_SMALL'
  | 'ILLEGAL_TRANSITION'
  | 'CONSOLIDATION'
  | 'HANDOFF_REJECTED'
  | 'PRESIGN_FORBIDDEN'
  | 'INVALID_INPUT'
  | 'ADDRESS_REUSE'
  | 'QUOTE_STALE'
  | 'NOT_DUE'
  | 'DIRECT_UNSUPPORTED';

/** Error carrying a stable {@link HopErrorCode}. */
export class HopError extends Error {
  /** Machine-readable code. */
  public readonly code: HopErrorCode;

  /**
   * @param code Stable code.
   * @param message Fixed text (no caller data).
   */
  public constructor(code: HopErrorCode, message: string) {
    super(message);
    this.name = 'HopError';
    this.code = code;
  }
}

/** Leg lifecycle. */
export type HopState = 'planned' | 'waiting' | 'due' | 'signing' | 'submitted' | 'confirmed' | 'failed' | 'cancelled';

/** Random source (subset of WebCrypto). */
export type CryptoLike = Pick<Crypto, 'getRandomValues'>;

/** A fresh one-use hop address plus a scoped key accessor. */
export interface HopAddress {
  readonly index: number;
  readonly address: Address;
}

/**
 * Local interface to the hygiene address allocator (hygiene lands in parallel; this package never imports it).
 *
 * @security `withSecretAt` must hand the key only to `fn` and zeroise it on exit, including on throw.
 */
export interface HopAddressSource {
  /** Allocates a never-used index and returns its address. */
  next(): Promise<HopAddress>;
  /** Scoped access to the key of an allocated index (the source `S1` index included). */
  withSecretAt<T>(index: number, fn: (secret: SecretScalar) => Promise<T>): Promise<T>;
  /** Optional ledger check: true when the address has been used before. */
  isUsed?(address: Address): Promise<boolean>;
}

/** Relayer fee quote. `expiresAtMs` is absolute wall-clock milliseconds. */
export interface HopQuote {
  readonly fee: bigint;
  readonly feeTo: Address;
  readonly expiresAtMs: number;
}

/** Plan input. */
export interface HopPlanInput {
  readonly chainId: number;
  readonly token: Address;
  /** `S1`. */
  readonly source: Address;
  /** Hop-address-source index of `S1` (needed to sign leg 1). */
  readonly sourceIndex: number;
  readonly sourceBalance: bigint;
  /** 0 is only valid with `handoff: 'pool-exit'` (spec default for pool exit). */
  readonly hops: 0 | 1 | 2 | 3 | 4;
  readonly delay: { readonly minMs: number; readonly maxMs: number; readonly maxTotalMs: number };
  readonly finalDestination: { readonly kind: 'self-derived' } | { readonly kind: 'external'; readonly address: Address };
  readonly relayers: readonly { readonly id: string; readonly url: string }[];
  readonly relayerSelection: 'rotate' | 'same' | 'direct';
  /** Preview-only quote per leg (1-based) for the amount that leg will carry (extension of the spec signature: amountIn added). Real quotes are fetched fresh at due time. */
  readonly quotes: (leg: number, amountIn: bigint) => Promise<HopQuote>;
  /** Default {@link DEFAULT_MAX_TOTAL_FEE_BPS}. */
  readonly maxTotalFeeBps: number;
  /** Literal `true` required: the user acknowledged the weak-mode dialog. */
  readonly ackWeak: true;
  readonly handoff: 'none' | 'pool-exit';
  /** Caller-probed ERC-2612 support of the token. */
  readonly tokenSupportsPermit: boolean;
  /** `post-exit` forwarding is always rejected. Default `pre-pool`. */
  readonly stage?: 'pre-pool' | 'post-exit';
}

/** One forwarding leg. Contains addresses, indices and amounts only: never keys or signatures. */
export interface HopLeg {
  readonly index: number;
  readonly from: Address;
  readonly to: Address;
  readonly fromIndex: number;
  readonly toIndex: number | null;
  /** Drawn delay applied after the previous leg confirms (or after plan creation for leg 0). */
  readonly delayMs: number;
  /** Absolute due time; projected while `planned`, fixed once `waiting`. */
  readonly dueAtMs: number;
  readonly relayerId: string;
  readonly expectedAmountIn: bigint;
  readonly expectedFee: bigint;
  readonly state: HopState;
  readonly nonce?: bigint;
  /** Unix seconds deadline of the order being signed or submitted (not a signature). */
  readonly deadlineS?: bigint;
  readonly txHash?: Hex;
}

/** Persistable plan. */
export interface HopPlan {
  readonly id: string;
  readonly chainId: number;
  readonly token: Address;
  readonly source: Address;
  readonly sourceIndex: number;
  readonly legs: readonly HopLeg[];
  readonly createdAtMs: number;
  readonly weak: true;
  readonly ackWeakAtMs: number;
  readonly handoff: 'none' | 'pool-exit';
  readonly delay: { readonly minMs: number; readonly maxMs: number };
  readonly relayerSelection: 'rotate' | 'same' | 'direct';
  readonly relayerCount: number;
  readonly externalDestination: boolean;
}

/** State machine events. */
export type HopEvent =
  | { readonly type: 'tick'; readonly nowMs: number }
  | { readonly type: 'beginSigning'; readonly leg: number; readonly nonce: bigint; readonly deadlineS: bigint }
  | { readonly type: 'submitted'; readonly leg: number; readonly txHash: Hex }
  | { readonly type: 'confirmed'; readonly leg: number; readonly nowMs: number }
  | { readonly type: 'revertToDue'; readonly leg: number }
  | { readonly type: 'fail'; readonly leg: number }
  | { readonly type: 'retry'; readonly leg: number }
  | { readonly type: 'cancel'; readonly leg: number };

/** Persistence port. Implementations must store plans exactly as {@link serializePlan} produces. */
export interface PlanStore {
  save(plan: HopPlan): Promise<void>;
  load(id: string): Promise<HopPlan | null>;
}

/** Order submission sent to a relayer. Carries no plan id, no previous-leg reference. */
export interface SweepSubmission {
  readonly chainId: number;
  readonly order: {
    readonly token: Address;
    readonly owner: Address;
    readonly destination: Address;
    readonly feeTo: Address;
    readonly amount: string;
    readonly fee: string;
    readonly deadline: string;
    readonly nonce: string;
  };
  readonly signature: Hex;
  readonly permit: { readonly value: string; readonly deadline: string; readonly v: number; readonly r: Hex; readonly s: Hex };
}

/** Relayer port (HTTP adapter lives in the app). `relayerId` selects url/proxy. */
export interface RelayerClient {
  quote(relayerId: string, req: { readonly chainId: number; readonly token: Address; readonly amount: string }): Promise<HopQuote>;
  submit(relayerId: string, req: SweepSubmission): Promise<{ readonly txHash: Hex }>;
}

/** Chain read port. No writes. */
export interface ChainReader {
  tokenBalance(token: Address, owner: Address): Promise<bigint>;
  /** `GhostPaySweepRelayer.nonceUsed(owner, nonce)`. */
  nonceUsed(owner: Address, nonce: bigint): Promise<boolean>;
  readonly permitReader: PermitReader;
}

/** User/session authorisation gate (autoContinue setting or an explicit prompt). */
export interface SignPort {
  authorize(leg: HopLeg): Promise<boolean>;
}

/** Dependencies of the executor. */
export interface HopDeps {
  readonly addrs: HopAddressSource;
  readonly relayer: RelayerClient;
  readonly chain: ChainReader;
  readonly store: PlanStore;
  readonly wallClockMs: () => number;
  readonly signWithSession: SignPort;
  /** `GhostPaySweepRelayer` address from the deployment manifest. */
  readonly sweepRelayer: Address;
  readonly rng: CryptoLike;
}

/** Default modelled-fee ceiling in bps. */
export const DEFAULT_MAX_TOTAL_FEE_BPS = 500;
/** Per-leg F-SPONSOR fee cap in bps. */
export const MAX_LEG_FEE_BPS = 300;
/** Order deadline window in seconds. */
export const DEADLINE_WINDOW_S = 900;
/** Overdue notice threshold (HOP-UX-4). */
export const OVERDUE_MS = 3_600_000;
