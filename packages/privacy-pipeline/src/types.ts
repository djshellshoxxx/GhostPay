import type { ChainRef } from './guard.js';
import type { Hex } from './hash.js';

/** Asset families a pipeline can hold. `confidential` is an ERC-7984 style wrapped balance. */
export type AssetKind = 'native' | 'erc20' | 'erc20-permit' | 'confidential' | 'btc';
export type PoolRef = 'shielded-pool' | 'privacy-pools' | 'railgun' | 'mock-pool';
export type Role = 'payer' | 'seller';
export type CtBackend = 'ct1-zama' | 'ct2-fhenix' | 'ct3-inco' | 'ctm-cleartext';

/** Typed value passed between steps (chaining spec 3.2). Addresses and amounts are runtime fields elsewhere. */
export type Holding =
  | { readonly t: 'payer-funds'; readonly wallet: 'long-lived' | 'fresh'; readonly asset: AssetKind }
  | { readonly t: 'payment-plan'; readonly parts: number; readonly asset: AssetKind }
  | {
      readonly t: 'note';
      readonly pool: PoolRef;
      readonly asset: AssetKind;
      readonly holder: 'payer' | 'seller';
    }
  | {
      readonly t: 'stealth';
      readonly asset: AssetKind;
      readonly origin: 'router' | 'pool' | 'confidential-router' | 'hop';
    }
  | {
      readonly t: 'owned';
      readonly asset: AssetKind;
      readonly origin: 'self-derived' | 'external' | 'pool-exit';
    }
  | { readonly t: 'paid' }
  | { readonly t: 'btc-utxo'; readonly kind: 'sp' | 'payjoin-addr' | 'plain' };

/** Structural pattern over a holding (T-1). Unlisted fields match anything. */
export interface HoldingPattern {
  readonly t: Holding['t'];
  readonly asset?: readonly string[];
  readonly origin?: readonly string[];
  readonly holder?: readonly string[];
  readonly wallet?: readonly string[];
  readonly kind?: readonly string[];
  readonly pool?: readonly string[];
}

export type StepKind =
  | 'src.wallet'
  | 'payer.fresh-wallet'
  | 'ct.wrap'
  | 'amount.shape'
  | 'pool.deposit'
  | 'pool.dwell'
  | 'pay.submit'
  | 'pay.from-pool'
  | 'recv.stealth'
  | 'sweep.delay'
  | 'hops.forward'
  | 'hygiene.sweep'
  | 'pool.exit'
  | 'ct.sweep'
  | 'ct.unwrap'
  | 'btc.send'
  | 'btc.recv'
  | 'btc.payjoin-contribute';

export type Purpose =
  | 'rpc'
  | 'scan'
  | 'read-address'
  | 'relayer'
  | 'sponsor'
  | 'pool-relayer'
  | 'decrypt-relayer'
  | 'payjoin-directory';

export type NetProfileId =
  'direct' | 'tor-browser' | 'tor-socks' | 'onion' | 'i2p-outproxy' | 'nym-mixfetch' | 'nym-socks5' | 'ohttp';

/** Cross-cutting layers, fixed for one run (chaining spec 3.4). */
export interface PipelineLayers {
  readonly transport: Readonly<Partial<Record<Purpose, NetProfileId>>>;
  readonly rpcMode: 'single' | 'quorum' | 'own-node' | 'light-client';
  readonly scanMode: 'range' | 'indexer-tor' | 'pir2' | 'light-client';
  readonly verification: 'address-free' | 'direct';
  readonly isolation: 'per-step' | 'per-purpose';
}

export type ParamValue = string | number | boolean;
export type StepParams = Readonly<Record<string, ParamValue>>;

/** One step of a pipeline: a kind plus closed-set parameters (unknown keys are rejected). */
export interface Step {
  readonly kind: StepKind;
  readonly params?: StepParams;
}

/** A linear pipeline of one role on one chain. Fan-out creates lineages at expansion time. */
export interface Pipeline {
  readonly v: 1;
  /** Caller-chosen id, 1..64 chars `[A-Za-z0-9._-]`; part of every instance id. */
  readonly id: string;
  readonly role: Role;
  readonly chain: ChainRef;
  readonly asset: AssetKind;
  readonly ctBackend?: CtBackend;
  /** Invoice gross as a decimal string, used only for the exact-wrap check (C-15). */
  readonly invoiceGross?: string;
  readonly steps: readonly Step[];
  readonly layers: PipelineLayers;
}

export type Env = 'web' | 'web-onion' | 'node';

/** Planning context: environment facts supplied by the app. */
export interface Context {
  readonly env: Env;
  readonly capabilities: ReadonlySet<string>;
  readonly testMode: boolean;
  /** Purposes whose non-direct transport passed its self-test (R-29, NP-T-5). */
  readonly selfTests: ReadonlySet<Purpose>;
}

export type Severity = 'error' | 'warn' | 'ack';
export type ErrorCode =
  | 'E_WRONG_CHAIN'
  | 'E_TYPE'
  | 'E_CHAIN_RULE'
  | 'E_CONFLICT'
  | 'E_WRONG_ASSET'
  | 'E_WRONG_ENV'
  | 'E_CAPABILITY'
  | 'E_SELFTEST'
  | 'E_UNKNOWN_VALUE'
  | 'E_PARAM'
  | 'E_TEST_MODE'
  | 'E_REQUIRES';

/** One validation finding. `key` is a message key; the package emits no prose. */
export interface Issue {
  readonly severity: Severity;
  readonly code: ErrorCode | 'WARN' | 'ACK';
  readonly key: string;
  readonly ruleId?: string;
  /** Extra discriminator, for example the purpose (party) a layer warning is about. */
  readonly detail?: string;
  /** Step indices involved, ascending. */
  readonly steps: readonly number[];
}

/** Profile-style option selection: option id -> value. */
export type Selection = Readonly<Record<string, string>>;

export interface PipelineValidation {
  readonly ok: boolean;
  /** All error issues, including `typeErrors`. */
  readonly blocking: readonly Issue[];
  readonly warnings: readonly Issue[];
  readonly requiredAcks: readonly string[];
  readonly typeErrors: readonly Issue[];
  readonly selection: Selection;
  /** Holding after the last step, or null when the pipeline is empty or untyped. */
  readonly endHolding: Holding | null;
}

export type StrengthClass =
  'baseline' | 'hygiene' | 'friction' | 'weak' | 'crowd-dependent-unlinking' | 'amount-confidential';
export type TrustParty = string;
export type LeakKey = string;

/** Per-instance quote entry for the cost model and the plan hash. */
export interface QuoteEntry {
  readonly feeBps: number;
  readonly gasWeiMax?: bigint;
  readonly latencyMinMs?: number;
  readonly latencyMaxMs?: number;
}
export type QuoteMap = Readonly<Record<string, QuoteEntry>>;

export interface PlanNode {
  readonly instanceId: string;
  readonly stepIndex: number;
  readonly kind: StepKind;
  readonly params: StepParams;
  /** Input lineage path (instances of per-part steps get their own part index appended). */
  readonly lineagePath: readonly number[];
  /** Number of output lineages (>= 1). */
  readonly fan: number;
  /** Instance this one waits for, or null for a start step. */
  readonly after: string | null;
  readonly inHolding: Holding | null;
  readonly outHolding: Holding;
}

export interface PlanTree {
  readonly nodes: readonly PlanNode[];
  /** Total number of lineages after the last step. */
  readonly lineages: number;
}

export interface PipelineSummary {
  readonly cost: {
    readonly perStep: readonly { instanceId: string; feeBps: number; feeBpsMin: number; gasWeiMax: bigint }[];
    readonly totalFeeBpsMax: number;
    readonly totalFeeBpsMin: number;
    readonly singleStepBaselineBps: number;
  };
  readonly latency: {
    readonly minMs: number;
    readonly maxMs: number;
    readonly creditedDwellMs: number;
    readonly appOpenRequired: boolean;
    readonly signaturePrompts: number;
  };
  readonly trust: readonly TrustParty[];
  readonly strength: readonly StrengthClass[];
  readonly reveals: readonly LeakKey[];
  readonly issues: readonly Issue[];
  readonly requiredAcks: readonly string[];
  /** Amount ladder keys (E-1): per fee-bearing instance, cumulative max fee in bps. */
  readonly amountLadderBps: readonly number[];
}

export type { Hex };
