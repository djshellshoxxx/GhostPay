/**
 * Core types for the privacy option catalogue. Pure data and types: no I/O.
 * @packageDocumentation
 */

/** EVM chain ids this proof of concept may act on. */
export type Chain = 31337 | 11155111 | 84532;
/** Testnet-only guard list (anvil, Sepolia, Base Sepolia). */
export const TESTNET_CHAIN_IDS: readonly Chain[] = [31337, 11155111, 84532];
/** Bitcoin networks this proof of concept may act on. */
export type BtcNetwork = 'testnet' | 'signet' | 'regtest';
/** Bitcoin testnet-only guard list. */
export const TESTNET_BTC_NETWORKS: readonly BtcNetwork[] = ['testnet', 'signet', 'regtest'];
/** Runtime environment of the caller. */
export type Env = 'web' | 'web-onion' | 'node';
/** User action an evaluation is for. */
export type Action = 'settings' | 'create-invoice' | 'pay' | 'scan' | 'sweep' | 'btc-receive' | 'btc-send';
/** Kind of asset the action moves. */
export type AssetKind = 'erc20-permit' | 'erc20' | 'native' | 'confidential' | 'btc';
/** Which party chooses an option. */
export type Scope = 'payer' | 'seller' | 'both' | 'relayer-operator' | 'deployment' | 'build';
/** Maturity of a value, copied from its method spec. */
export type Maturity = 'existing' | 'poc' | 'spike-gated' | 'experimental' | 'test-only' | 'stub' | 'watch';
/** What kind of effect a value has. A kind, never a level of protection. */
export type StrengthClass =
  | 'baseline'
  | 'hygiene'
  | 'friction'
  | 'weak'
  | 'network-origin'
  | 'integrity-only'
  | 'amount-confidential'
  | 'tx-structure'
  | 'crowd-dependent-unlinking';

/** Capability asserted by the caller. This package cannot verify any of them. */
export type Capability =
  | 'sweep-relayer'
  | 'multi-relayer'
  | 'payer-sponsor'
  | 'eip7702'
  | 'erc4337-entrypoint'
  | 'erc4337-paymaster'
  | 'manifest:shielded-pool'
  | 'pool-relayer'
  | 'pool-note'
  | 'asp-publisher'
  | 'manifest:privacy-pools'
  | 'pp-relayer'
  | 'manifest:railgun'
  | 'railgun-broadcaster'
  | 'manifest:confidential-ct1'
  | 'manifest:confidential-ct2'
  | 'manifest:confidential-ct3'
  | 'seller-accepts-ct'
  | 'tor-browser-asserted'
  | 'tor-socks'
  | 'onion-origin'
  | 'onion-rpc'
  | 'onion-relayer'
  | 'i2p-proxy'
  | 'nym-build'
  | 'nym-socks5'
  | 'ohttp-gateway-rpc'
  | 'ohttp-gateway-relayer'
  | 'multi-rpc'
  | 'own-node'
  | 'light-client'
  | 'tor-indexer'
  | 'pir-servers'
  | 'payjoin-directory'
  | 'payjoin-ffi'
  | 'payjoin-v1-endpoint'
  | 'selftest-ok:rpc'
  | 'selftest-ok:relayer'
  | 'test-mode';

/** Party a selection trusts. */
export type TrustParty =
  | 'rpc'
  | 'sweep-relayer'
  | 'payer-sponsor'
  | 'bundler'
  | 'paymaster'
  | 'pool-relayer'
  | 'asp-publisher'
  | 'own-circuits-dev-ceremony'
  | 'own-unaudited-contracts'
  | 'privacy-pools-operator'
  | 'privacy-pools-asp'
  | 'railgun-ppoi'
  | 'railgun-broadcaster'
  | 'third-party-unaudited-code'
  | 'zama-kms-coprocessors'
  | 'zama-decrypt-relayer'
  | 'fhenix-network'
  | 'inco-tee'
  | 'tor-network'
  | 'tor-exit'
  | 'i2p-outproxy'
  | 'nym-mixnet'
  | 'ohttp-relay'
  | 'ohttp-gateway'
  | 'pir-server-pair'
  | 'indexer'
  | 'light-client-checkpoint'
  | 'payjoin-directory'
  | 'payjoin-ohttp-relay'
  | 'private-submission-endpoint';

/** Spec-scoped leak id, for example `hygiene:L4`. */
export type LeakKey = string;
/** Warning text key. */
export type WarningKey = `privacy.warn.${string}`;
/** Acknowledgement text key. */
export type AckKey = `privacy.ack.${string}`;
/** Error text key. */
export type ErrorKey = `privacy.err.${string}`;

/** Option groups, in display order. */
export type GroupId = 'sweep' | 'pay' | 'invoice' | 'network' | 'btc' | 'operator';

/** Every option id. Selectable ones first, operator and build scope last. */
export const OPTION_IDS = [
  'sweep.destination',
  'sweep.verification',
  'sweep.dust',
  'sweep.knownWalletGuard',
  'sweep.delay',
  'sweep.hops',
  'sweep.hopRelayers',
  'sweep.exit',
  'sweep.poolAsp',
  'sweep.poolSubmit',
  'sweep.poolAmountPlan',
  'sweep.exitGas',
  'pay.payerMode',
  'pay.source',
  'pay.amountBlur',
  'pay.amountVisibility',
  'pay.bufferRounding',
  'pay.route',
  'pay.amountNoise',
  'pay.gasNormalise',
  'invoice.encrypt',
  'invoice.padding',
  'invoice.coarseTime',
  'invoice.quoteRounding',
  'identity.perInvoiceMeta',
  'identity.perChainKeys',
  'announce.metadata',
  'announce.viewTag',
  'announce.schemeId',
  'net.rpcProfile',
  'net.relayerProfile',
  'net.rpcMode',
  'net.endpointSeparation',
  'net.scanMode',
  'net.scanAlign',
  'relayer.multi',
  'relayer.padding',
  'btc.mode',
  'btc.contributeFromSp',
  'btc.change',
  'btc.feeRateNormalise',
  'btc.locktime',
  'btc.rbf',
  'btc.ordering',
  'btc.psbtStrip',
  'ops.walletFunding',
  'ops.privateSubmission',
  'ops.relayerPolicy',
  'ops.relayerResponsePadding',
  'ops.upstreamTransport',
  'ops.rateLimitBucket',
  'ops.feeNotTracked',
  'ops.announceDefaults',
  'ops.sweepRelayerV2',
  'ops.webHardening',
  'ops.buildNetProfile',
] as const;
/** Option id. */
export type OptionId = (typeof OPTION_IDS)[number];

/** Spec reference: file under `docs/remote/privacy-specs/` (or `security-specs/`) and ids found in it. */
export interface SpecRef {
  readonly file: string;
  readonly ids: readonly string[];
}

/** One selectable value of an option. */
export interface ValueDef {
  readonly value: string;
  readonly specRef: SpecRef;
  readonly maturity: Maturity;
  readonly strength: StrengthClass;
  readonly requires: readonly Capability[];
  readonly requiresAny?: readonly Capability[];
  readonly env?: readonly Env[];
  readonly chains?: readonly Chain[];
  readonly assets?: readonly AssetKind[];
  readonly trust: readonly TrustParty[];
  readonly hides: readonly LeakKey[];
  readonly doesNotHide: readonly LeakKey[];
  readonly warnings: readonly WarningKey[];
  readonly acks: readonly AckKey[];
  readonly specCopyKeys: readonly string[];
  readonly buildPackage: string | null;
}

/** One option. */
export interface OptionDef {
  readonly id: OptionId;
  readonly group: GroupId;
  readonly scope: Scope;
  readonly actions: readonly Action[];
  readonly userSelectable: boolean;
  readonly defaultValue: string;
  readonly values: readonly ValueDef[];
  /** When set, the option only applies while this predicate holds; otherwise only the dependency rules look at it. */
  readonly activeWhen?: Pred;
}

/** Preset ids. */
export type PresetId = 'standard' | 'enhanced' | 'maximum' | 'confidential-amount';

/** A user selection. Missing option means its default. */
export interface Selection {
  readonly preset: PresetId | 'custom';
  readonly values: Readonly<Partial<Record<OptionId, string>>>;
  readonly acks: readonly AckKey[];
}

/** Evaluation context, asserted by the caller. */
export interface Context {
  readonly action: Action;
  readonly chainId: number | null;
  readonly btcNetwork?: string | null;
  readonly env: Env;
  readonly asset?: AssetKind;
  readonly capabilities: ReadonlySet<Capability>;
}

/** Issue codes. `E_*` block, `W_*` inform. */
export type IssueCode =
  | 'E_CONFLICT'
  | 'E_REQUIRES'
  | 'E_CAPABILITY'
  | 'E_WRONG_CHAIN'
  | 'E_WRONG_ENV'
  | 'E_WRONG_ASSET'
  | 'E_NOT_SELECTABLE'
  | 'E_UNKNOWN_VALUE'
  | 'E_MATURITY'
  | 'E_ACK_MISSING'
  | 'E_SELFTEST'
  | 'W_RULE'
  | 'W_VALUE'
  | 'W_MOOT';

/** Rule id. */
export type RuleId = `R-${string}`;

/** One finding of an evaluation. */
export interface Issue {
  readonly code: IssueCode;
  readonly key: WarningKey | ErrorKey | AckKey;
  readonly options: readonly OptionId[];
  readonly ruleId?: RuleId;
  readonly specRef?: SpecRef;
}

/** Result of evaluating a selection. */
export interface Evaluation {
  readonly ok: boolean;
  readonly blocking: readonly Issue[];
  readonly warnings: readonly Issue[];
  readonly requiredAcks: readonly AckKey[];
  readonly effective: Readonly<Record<OptionId, string>>;
  readonly trust: readonly TrustParty[];
  readonly hides: readonly LeakKey[];
  readonly doesNotHide: readonly LeakKey[];
  readonly strength: readonly StrengthClass[];
  readonly specCopyKeys: readonly string[];
}

/** A value a preset could not apply. */
export interface Downgrade {
  readonly option: OptionId;
  readonly wanted: string;
  readonly got: string;
  readonly reason: IssueCode;
  readonly key: string;
}

/** Result of {@link applyPreset}. */
export interface PresetResult {
  readonly selection: Selection;
  readonly evaluation: Evaluation;
  readonly downgrades: readonly Downgrade[];
}

/** Preset definition. */
export interface PresetDef {
  readonly id: PresetId;
  readonly order: readonly OptionId[];
  readonly prefer: Readonly<Partial<Record<OptionId, readonly string[]>>>;
}

/** Names of the dynamic scans used by rules that look at every option. */
export type ScanName =
  | 'chain'
  | 'maturity-unavailable'
  | 'maturity-test-only'
  | 'maturity-experimental'
  | 'env'
  | 'selftest'
  | 'relay-direct';

/** Rule predicate DSL. */
export type Pred =
  | { readonly opt: OptionId; readonly in: readonly string[] }
  | { readonly opt: OptionId; readonly notIn: readonly string[] }
  | { readonly cap: Capability }
  | { readonly notCap: Capability }
  | { readonly env: readonly Env[] }
  | { readonly asset: readonly AssetKind[] }
  | { readonly assetNot: readonly AssetKind[] }
  | { readonly action: readonly Action[] }
  | { readonly ack: AckKey }
  | { readonly scan: ScanName }
  | { readonly all: readonly Pred[] }
  | { readonly any: readonly Pred[] }
  | { readonly not: Pred };

/** Rule definition. */
export interface RuleDef {
  readonly id: RuleId;
  readonly kind: 'conflict' | 'requires' | 'warn' | 'moot';
  readonly when: Pred;
  readonly then?: Pred;
  readonly code?: IssueCode;
  readonly key: WarningKey | ErrorKey;
  readonly specRef: SpecRef | 'new';
}

/** One cell of the compatibility matrix. */
export interface MatrixCell {
  readonly a: { readonly option: OptionId; readonly value: string };
  readonly b: { readonly option: OptionId; readonly value: string };
  readonly relation: 'ok' | 'conflict' | 'requires' | 'warn' | 'moot';
  readonly ruleIds: readonly RuleId[];
}
