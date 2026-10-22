import type {
  AssetKind,
  CtBackend,
  Holding,
  HoldingPattern,
  ParamValue,
  PoolRef,
  Purpose,
  Role,
  Step,
  StepKind,
  StepParams,
  StrengthClass,
  TrustParty,
} from './types.js';

/** Closed parameter spec. Unknown keys and out-of-range values are rejected by the validator. */
export type ParamSpec =
  | { readonly type: 'enum'; readonly values: readonly string[]; readonly default: string }
  | { readonly type: 'int'; readonly min: number; readonly max: number; readonly default: number }
  | { readonly type: 'bool'; readonly default: boolean }
  | { readonly type: 'str'; readonly maxLen: number; readonly default: string };
export type ParamSchema = Readonly<Record<string, ParamSpec>>;

/** What a step sees about its place in the pipeline when projecting to profile options. */
export interface ProjectCtx {
  readonly role: Role;
  readonly asset: AssetKind;
  readonly ctBackend: CtBackend;
  /** Steps after this one in the pipeline. */
  readonly later: readonly Step[];
  /** Normalised params of the nearest earlier `pool.deposit`, if any. */
  readonly earlierPool: PoolRef | null;
  /** Holding this step receives (null for a start step). */
  readonly input: Holding | null;
}

export interface ProduceCtx {
  readonly role: Role;
  readonly asset: AssetKind;
}

export interface StepDef {
  readonly kind: StepKind;
  readonly role: Role | 'both';
  readonly family: 'evm' | 'btc';
  /** May be the first step of a pipeline (no input holding). */
  readonly start: boolean;
  readonly accepts: readonly HoldingPattern[];
  readonly params: ParamSchema;
  readonly produce: (p: StepParams, input: Holding | null, c: ProduceCtx) => Holding;
  /** Number of output lineages (`outputs` mode) or instances (`per-part` mode). */
  readonly fan: (p: StepParams, input: Holding | null) => number;
  readonly fanMode: 'outputs' | 'per-part';
  readonly waits: boolean;
  /** Delay contained in the step for `fan` lineages/instances; fixed numbers when min == max. */
  readonly wait: (p: StepParams, fan: number) => { readonly minMs: number; readonly maxMs: number };
  readonly purposes: (p: StepParams) => readonly Purpose[];
  readonly onChain: boolean;
  readonly fee: (p: StepParams) => { readonly minBps: number; readonly maxBps: number };
  readonly trust: (p: StepParams) => readonly TrustParty[];
  readonly strength: (p: StepParams) => readonly StrengthClass[];
  /** Message keys for what the step does NOT hide (`privacy.warn.*`). */
  readonly doesNotHide: (p: StepParams) => readonly string[];
  /** Extra cross-parameter checks; returns parameter names that are inconsistent. */
  readonly paramCheck?: (p: StepParams, c: ProduceCtx) => readonly string[];
  readonly project: (p: StepParams, c: ProjectCtx) => Readonly<Record<string, string>>;
  readonly specRef: { readonly file: string; readonly ids: readonly string[] };
  readonly maturity: 'poc' | 'existing' | 'experimental';
}

/** Hours to milliseconds. */
const H = 3_600_000;
/** Static fee placeholder for a pool relayer; the spec gives only "<= MAX_RELAYER_FEE_BPS". Quotes override. */
export const POOL_RELAYER_FEE_BPS_CAP = 100;
/** Router fee in bps (hops spec section 4.3, FEE schedule). */
export const ROUTER_FEE_BPS = 25;
/** Sweep relayer fee floor and cap in bps: `max(gas*1.10, 50 bps)` capped at 300 (hops spec 4.3). */
export const SWEEP_RELAYER_FEE_MIN_BPS = 50;
export const SWEEP_RELAYER_FEE_MAX_BPS = 300;
/** Minimum wrap dwell before a confidential payment. The spec says "min dwell" without a number; owner review. */
export const CT_MIN_DWELL_MS = 1 * H;
/** Default hop delay range (hops spec: 10 min .. 12 h). */
export const HOP_DELAY_MIN_MS = 600_000;
export const HOP_DELAY_MAX_MS = 12 * H;

const ASSETS_PLAIN = ['native', 'erc20', 'erc20-permit'] as const;
const SPONSORED_MODES = ['permit-relay', 'eip7702-sponsored', 'erc4337-paymaster'] as const;

const enumP = (values: readonly string[], def?: string): ParamSpec => ({
  type: 'enum',
  values,
  default: def ?? (values[0] as string),
});
const intP = (min: number, max: number, def: number): ParamSpec => ({ type: 'int', min, max, default: def });
const boolP = (def: boolean): ParamSpec => ({ type: 'bool', default: def });
const strP = (maxLen: number): ParamSpec => ({ type: 'str', maxLen, default: '' });

const none: readonly never[] = [];
const noWait = (): { minMs: number; maxMs: number } => ({ minMs: 0, maxMs: 0 });
const noFee = (): { minBps: number; maxBps: number } => ({ minBps: 0, maxBps: 0 });

function s(p: StepParams, k: string): string {
  return p[k] as string;
}
function n(p: StepParams, k: string): number {
  return p[k] as number;
}
function b(p: StepParams, k: string): boolean {
  return p[k] as boolean;
}

/**
 * Compounded fee of `legs` sequential fees of `legBps` each, in whole bps.
 * Exact integer arithmetic; `round` selects floor (minimum model) or ceil (cap model).
 */
export function compoundFeeBps(legBps: number, legs: number, round: 'floor' | 'ceil'): number {
  const scale = 10n ** 12n;
  let remaining = scale;
  for (let i = 0; i < legs; i++) remaining = (remaining * BigInt(10_000 - legBps)) / 10_000n;
  const num = (scale - remaining) * 10_000n;
  const q = num / scale;
  return Number(round === 'ceil' && num % scale !== 0n ? q + 1n : q);
}

const POOL_TRUST: Readonly<Record<PoolRef, readonly TrustParty[]>> = {
  'shielded-pool': ['own-circuits-dev-ceremony', 'own-unaudited-contracts'],
  'privacy-pools': ['privacy-pools-operator', 'privacy-pools-asp', 'third-party-unaudited-code'],
  railgun: ['railgun-ppoi', 'third-party-unaudited-code'],
  'mock-pool': [],
};
const POOL_LEAKS: Readonly<Record<PoolRef, readonly string[]>> = {
  'shielded-pool': ['privacy.warn.insecureCeremony', 'privacy.warn.ownContractsUnaudited'],
  'privacy-pools': ['privacy.warn.thirdPartyUnaudited', 'privacy.warn.aspChoiceDisclosed'],
  railgun: ['privacy.warn.thirdPartyUnaudited'],
  'mock-pool': ['privacy.warn.mockNoPrivacy'],
};
const CT_TRUST: Readonly<Record<CtBackend, readonly TrustParty[]>> = {
  'ct1-zama': ['zama-kms-coprocessors', 'zama-decrypt-relayer'],
  'ct2-fhenix': ['fhenix-network'],
  'ct3-inco': ['inco-tee'],
  'ctm-cleartext': [],
};
const CT_LEAKS: Readonly<Record<CtBackend, readonly string[]>> = {
  'ct1-zama': ['privacy.warn.fheOperatorTrust', 'privacy.warn.decryptRelayerSees'],
  'ct2-fhenix': ['privacy.warn.fheOperatorTrust'],
  'ct3-inco': ['privacy.warn.teeTrust'],
  'ctm-cleartext': ['privacy.warn.mockNoPrivacy'],
};

const isPayjoin = (m: string): boolean => m === 'payjoin-v1' || m === 'payjoin-v2';

function mapDestination(d: string): string {
  if (d === 'self-derived') return 'self-derived';
  if (d === 'external-reuse') return 'external-reuse';
  return 'external-fresh';
}

const SPEC = (file: string, ...ids: string[]): { file: string; ids: readonly string[] } => ({ file, ids });

/** Normative step catalogue (chaining spec 3.3). Data only; the validator interprets it. */
export const STEP_CATALOGUE: Readonly<Record<StepKind, StepDef>> = {
  'src.wallet': {
    kind: 'src.wallet',
    role: 'payer',
    family: 'evm',
    start: true,
    accepts: [],
    params: {},
    produce: (_p, _i, c) => ({ t: 'payer-funds', wallet: 'long-lived', asset: c.asset }),
    fan: () => 1,
    fanMode: 'outputs',
    waits: false,
    wait: noWait,
    purposes: () => none,
    onChain: false,
    fee: noFee,
    trust: () => none,
    strength: () => ['baseline'],
    doesNotHide: () => ['privacy.warn.payerStillPublic'],
    project: () => ({}),
    specRef: SPEC('payer-hiding.md', 'PH-0'),
    maturity: 'existing',
  },
  'payer.fresh-wallet': {
    kind: 'payer.fresh-wallet',
    role: 'payer',
    family: 'evm',
    start: false,
    accepts: [{ t: 'payer-funds', wallet: ['long-lived'] }],
    params: { delayMs: intP(0, 7 * 24 * H, H) },
    produce: (_p, i) =>
      i !== null && i.t === 'payer-funds'
        ? { ...i, wallet: 'fresh' }
        : { t: 'payer-funds', wallet: 'fresh', asset: 'erc20' },
    fan: () => 1,
    fanMode: 'outputs',
    waits: true,
    wait: (p) => ({ minMs: n(p, 'delayMs'), maxMs: n(p, 'delayMs') }),
    purposes: () => ['rpc'],
    onChain: true,
    fee: noFee,
    trust: () => ['rpc'],
    strength: () => ['hygiene'],
    doesNotHide: () => [
      'privacy.warn.payerStillPublic',
      'privacy.warn.tokenFundingLink',
      'privacy.warn.tabMustStayOpen',
    ],
    project: (_p, c) =>
      c.later.some((x) => x.kind === 'pool.deposit') ? {} : { 'pay.payerMode': 'fresh-wallet' },
    specRef: SPEC('payer-hiding.md', 'PH-1'),
    maturity: 'poc',
  },
  'ct.wrap': {
    kind: 'ct.wrap',
    role: 'payer',
    family: 'evm',
    start: false,
    accepts: [{ t: 'payer-funds', asset: ['erc20', 'erc20-permit'] }],
    params: {
      backend: enumP(['ct1-zama', 'ct2-fhenix', 'ct3-inco', 'ctm-cleartext']),
      amount: strP(40),
      dwellMs: intP(0, 7 * 24 * H, CT_MIN_DWELL_MS),
    },
    produce: (_p, i) => ({
      t: 'payer-funds',
      wallet: i !== null && i.t === 'payer-funds' ? i.wallet : 'long-lived',
      asset: 'confidential',
    }),
    fan: () => 1,
    fanMode: 'outputs',
    waits: true,
    wait: (p) => ({ minMs: n(p, 'dwellMs'), maxMs: n(p, 'dwellMs') }),
    purposes: () => ['rpc'],
    onChain: true,
    fee: noFee,
    trust: (p) => ['rpc', ...CT_TRUST[s(p, 'backend') as CtBackend]],
    strength: () => ['amount-confidential'],
    doesNotHide: (p) => [
      'privacy.warn.wrapUnwrapPublic',
      'privacy.warn.zeroTransferAmbiguity',
      ...CT_LEAKS[s(p, 'backend') as CtBackend],
    ],
    project: (p) => ({ 'pay.amountVisibility': s(p, 'backend') }),
    specRef: SPEC('confidential-tokens.md', 'CT-UX-4'),
    maturity: 'poc',
  },
  'amount.shape': {
    kind: 'amount.shape',
    role: 'payer',
    family: 'evm',
    start: false,
    accepts: [{ t: 'payer-funds' }],
    params: { mode: enumP(['round', 'delay', 'split', 'denom']), parts: intP(1, 16, 1), noise: boolP(false) },
    produce: (p, i) => ({
      t: 'payment-plan',
      parts: n(p, 'parts'),
      asset: i !== null && i.t === 'payer-funds' ? i.asset : 'erc20',
    }),
    fan: () => 1,
    fanMode: 'outputs',
    waits: false,
    wait: noWait,
    purposes: () => none,
    onChain: false,
    fee: noFee,
    trust: () => none,
    strength: () => ['friction'],
    doesNotHide: (p) => [
      'privacy.warn.tabMustStayOpen',
      'privacy.warn.timingNotHidden',
      ...(s(p, 'mode') === 'round' ? ['privacy.warn.roundUpCost'] : []),
      ...(s(p, 'mode') === 'split' || s(p, 'mode') === 'denom' ? ['privacy.warn.fanOutLinkable'] : []),
    ],
    paramCheck: (p) => {
      const m = s(p, 'mode');
      const k = n(p, 'parts');
      return (m === 'split' && k < 2) || ((m === 'round' || m === 'delay') && k !== 1) ? ['parts'] : [];
    },
    project: (p, c) =>
      c.later.some((x) => x.kind === 'pool.deposit')
        ? {}
        : { 'pay.amountBlur': s(p, 'mode'), ...(b(p, 'noise') ? { 'pay.amountNoise': 'on' } : {}) },
    specRef: SPEC('amount-blurring.md', 'AB-DENOM', 'AB-DELAY'),
    maturity: 'poc',
  },
  'pool.deposit': {
    kind: 'pool.deposit',
    role: 'both',
    family: 'evm',
    start: false,
    accepts: [
      { t: 'payer-funds', asset: [...ASSETS_PLAIN] },
      { t: 'payment-plan', asset: [...ASSETS_PLAIN] },
      { t: 'stealth', asset: [...ASSETS_PLAIN], origin: ['router', 'pool', 'hop'] },
    ],
    params: {
      pool: enumP(['shielded-pool', 'privacy-pools', 'railgun', 'mock-pool']),
      n: intP(1, 8, 1),
      amountPlan: enumP(['denominations', 'whole']),
      exitGas: enumP(['permit-sponsored', 'buffer', 'topup', 'eip7702']),
      payerSponsor: enumP(['none', 'permit-relay']),
    },
    produce: (p, i, c) => ({
      t: 'note',
      pool: s(p, 'pool') as PoolRef,
      asset: i !== null && 'asset' in i ? i.asset : c.asset,
      holder: c.role === 'payer' ? 'payer' : 'seller',
    }),
    fan: (p, i) => (i !== null && i.t === 'payment-plan' ? i.parts : n(p, 'n')),
    fanMode: 'outputs',
    waits: false,
    wait: noWait,
    purposes: (p) => [
      'rpc',
      ...(s(p, 'payerSponsor') !== 'none' ? (['sponsor'] as const) : []),
      ...(s(p, 'exitGas') === 'permit-sponsored' ? (['pool-relayer'] as const) : []),
    ],
    onChain: true,
    fee: noFee,
    trust: (p) => [
      'rpc',
      ...POOL_TRUST[s(p, 'pool') as PoolRef],
      ...(s(p, 'payerSponsor') !== 'none' ? ['payer-sponsor'] : []),
    ],
    strength: (p) => (s(p, 'pool') === 'mock-pool' ? ['baseline'] : ['crowd-dependent-unlinking']),
    doesNotHide: (p) => [
      'privacy.warn.depositPublic',
      'privacy.warn.crowdTiny',
      'privacy.warn.ragequitRelinks',
      ...POOL_LEAKS[s(p, 'pool') as PoolRef],
      ...(s(p, 'amountPlan') === 'whole' ? ['privacy.warn.amountTimingMatch'] : []),
      ...(s(p, 'exitGas') === 'topup' ? ['privacy.warn.gasFundingLink'] : []),
      ...(s(p, 'exitGas') === 'eip7702' ? ['privacy.warn.persistent7702Delegate'] : []),
    ],
    paramCheck: (p) => (s(p, 'amountPlan') === 'whole' && n(p, 'n') > 1 ? ['n'] : []),
    project: (p, c) =>
      c.role === 'payer'
        ? {}
        : {
            'sweep.exit': s(p, 'pool'),
            'sweep.poolAmountPlan': s(p, 'amountPlan'),
            'sweep.exitGas': s(p, 'exitGas'),
          },
    specRef: SPEC('shielded-pool.md', 'SP-SDK-8', 'SP-EXIT', 'SP-PAY'),
    maturity: 'poc',
  },
  'pool.dwell': {
    kind: 'pool.dwell',
    role: 'both',
    family: 'evm',
    start: false,
    accepts: [{ t: 'note' }],
    params: { minHours: intP(0, 24 * 14, 24), maxHours: intP(0, 24 * 14, 72) },
    produce: (_p, i, c) =>
      i !== null && i.t === 'note'
        ? i
        : { t: 'note', pool: 'shielded-pool', asset: c.asset, holder: 'seller' },
    fan: () => 1,
    fanMode: 'outputs',
    waits: true,
    wait: (p) => ({ minMs: n(p, 'minHours') * H, maxMs: n(p, 'maxHours') * H }),
    purposes: () => ['scan'],
    onChain: false,
    fee: noFee,
    trust: () => none,
    strength: () => none,
    doesNotHide: () => ['privacy.warn.timingNotHidden', 'privacy.warn.tabMustStayOpen'],
    paramCheck: (p) => (n(p, 'minHours') > n(p, 'maxHours') ? ['minHours'] : []),
    project: () => ({}),
    specRef: SPEC('shielded-pool.md', 'SP-EXIT'),
    maturity: 'poc',
  },
  'pay.submit': {
    kind: 'pay.submit',
    role: 'payer',
    family: 'evm',
    start: false,
    accepts: [{ t: 'payer-funds' }, { t: 'payment-plan' }],
    params: {
      payerMode: enumP(['direct', ...SPONSORED_MODES]),
      route: enumP(['router', 'direct-no-fee', 'accrual']),
      gapMinMs: intP(0, 24 * H, 0),
      gapMaxMs: intP(0, 24 * H, 0),
    },
    produce: () => ({ t: 'paid' }),
    fan: (_p, i) => (i !== null && i.t === 'payment-plan' ? i.parts : 1),
    fanMode: 'per-part',
    waits: true,
    wait: (p, fan) => ({
      minMs: n(p, 'gapMinMs') * Math.max(0, fan - 1),
      maxMs: n(p, 'gapMaxMs') * Math.max(0, fan - 1),
    }),
    purposes: (p) => ['rpc', ...(s(p, 'payerMode') !== 'direct' ? (['sponsor'] as const) : [])],
    onChain: true,
    fee: (p) =>
      s(p, 'route') === 'direct-no-fee'
        ? { minBps: 0, maxBps: 0 }
        : { minBps: ROUTER_FEE_BPS, maxBps: ROUTER_FEE_BPS },
    trust: (p) => {
      const m = s(p, 'payerMode');
      return [
        'rpc',
        ...(m === 'permit-relay' || m === 'eip7702-sponsored'
          ? ['payer-sponsor', 'own-unaudited-contracts']
          : []),
        ...(m === 'erc4337-paymaster' ? ['bundler', 'paymaster', 'own-unaudited-contracts'] : []),
      ];
    },
    strength: (p) => (s(p, 'payerMode') === 'direct' ? ['baseline'] : ['friction']),
    doesNotHide: (p) => [
      'privacy.warn.payerStillPublic',
      ...(s(p, 'payerMode') !== 'direct' ? ['privacy.warn.sponsorSees'] : []),
      ...(s(p, 'route') === 'direct-no-fee' ? ['privacy.warn.directNoFeeScanner'] : []),
    ],
    paramCheck: (p) => (n(p, 'gapMinMs') > n(p, 'gapMaxMs') ? ['gapMinMs'] : []),
    project: (p, c) => ({
      'pay.payerMode': s(p, 'payerMode'),
      'pay.route': s(p, 'route'),
      ...(c.input !== null && 'asset' in c.input && c.input.asset === 'confidential'
        ? { 'pay.amountVisibility': c.ctBackend }
        : {}),
    }),
    specRef: SPEC('payer-hiding.md', 'PH-0'),
    maturity: 'poc',
  },
  'pay.from-pool': {
    kind: 'pay.from-pool',
    role: 'payer',
    family: 'evm',
    start: false,
    accepts: [{ t: 'note', holder: ['payer'], pool: ['shielded-pool'] }],
    params: {
      payerMode: enumP(['direct', ...SPONSORED_MODES, 'fresh-wallet']),
      route: enumP(['router', 'direct-no-fee']),
    },
    produce: () => ({ t: 'paid' }),
    fan: () => 1,
    fanMode: 'outputs',
    waits: false,
    wait: noWait,
    purposes: () => ['pool-relayer'],
    onChain: true,
    fee: () => ({ minBps: 0, maxBps: POOL_RELAYER_FEE_BPS_CAP }),
    trust: () => ['pool-relayer', 'own-circuits-dev-ceremony', 'own-unaudited-contracts'],
    strength: () => ['crowd-dependent-unlinking'],
    doesNotHide: () => [
      'privacy.warn.crowdTiny',
      'privacy.warn.depositPublic',
      'privacy.warn.insecureCeremony',
      'privacy.warn.amountTimingMatch',
    ],
    project: (p) => ({
      'pay.source': 'shielded-pool',
      'pay.payerMode': s(p, 'payerMode'),
      'pay.route': s(p, 'route'),
    }),
    specRef: SPEC('shielded-pool.md', 'SP-PAY'),
    maturity: 'poc',
  },
  'recv.stealth': {
    kind: 'recv.stealth',
    role: 'seller',
    family: 'evm',
    start: true,
    accepts: [],
    params: { origin: enumP(['router', 'pool', 'confidential-router']) },
    produce: (p, _i, c) => ({
      t: 'stealth',
      asset: c.asset,
      origin: s(p, 'origin') as 'router' | 'pool' | 'confidential-router',
    }),
    fan: () => 1,
    fanMode: 'outputs',
    waits: false,
    wait: noWait,
    purposes: () => ['scan'],
    onChain: false,
    fee: noFee,
    trust: () => none,
    strength: () => ['baseline'],
    doesNotHide: () => ['privacy.warn.contentNotHidden'],
    paramCheck: (p, c) =>
      (s(p, 'origin') === 'confidential-router') !== (c.asset === 'confidential') ? ['origin'] : [],
    project: (p, c) =>
      s(p, 'origin') === 'confidential-router' ? { 'pay.amountVisibility': c.ctBackend } : {},
    specRef: SPEC('hygiene.md', 'HY-VER'),
    maturity: 'existing',
  },
  'sweep.delay': {
    kind: 'sweep.delay',
    role: 'seller',
    family: 'evm',
    start: false,
    accepts: [{ t: 'stealth' }],
    params: { minMs: intP(0, 7 * 24 * H, 600_000), maxMs: intP(0, 7 * 24 * H, 6 * H) },
    produce: (_p, i, c) =>
      i !== null && i.t === 'stealth' ? i : { t: 'stealth', asset: c.asset, origin: 'router' },
    fan: () => 1,
    fanMode: 'outputs',
    waits: true,
    wait: (p) => ({ minMs: n(p, 'minMs'), maxMs: n(p, 'maxMs') }),
    purposes: () => none,
    onChain: false,
    fee: noFee,
    trust: () => none,
    strength: () => ['friction'],
    doesNotHide: () => ['privacy.warn.tabMustStayOpen', 'privacy.warn.timingNotHidden'],
    paramCheck: (p) => (n(p, 'minMs') > n(p, 'maxMs') ? ['minMs'] : []),
    project: () => ({ 'sweep.delay': 'jitter' }),
    specRef: SPEC('amount-blurring.md', 'AB-DELAY'),
    maturity: 'poc',
  },
  'hops.forward': {
    kind: 'hops.forward',
    role: 'seller',
    family: 'evm',
    start: false,
    accepts: [{ t: 'stealth', asset: ['erc20-permit'] }],
    params: {
      hops: intP(1, 4, 2),
      hopRelayers: enumP(['rotate', 'same', 'direct']),
      delayMinMs: intP(0, 7 * 24 * H, HOP_DELAY_MIN_MS),
      delayMaxMs: intP(0, 7 * 24 * H, HOP_DELAY_MAX_MS),
    },
    produce: (_p, i, c) => ({
      t: 'stealth',
      asset: i !== null && 'asset' in i ? i.asset : c.asset,
      origin: 'hop',
    }),
    fan: () => 1,
    fanMode: 'outputs',
    waits: true,
    wait: (p) => ({ minMs: n(p, 'hops') * n(p, 'delayMinMs'), maxMs: n(p, 'hops') * n(p, 'delayMaxMs') }),
    purposes: (p) => (s(p, 'hopRelayers') === 'direct' ? ['rpc'] : ['relayer', 'rpc']),
    onChain: true,
    fee: (p) => ({
      minBps: compoundFeeBps(SWEEP_RELAYER_FEE_MIN_BPS, n(p, 'hops'), 'floor'),
      maxBps: compoundFeeBps(SWEEP_RELAYER_FEE_MAX_BPS, n(p, 'hops'), 'ceil'),
    }),
    trust: (p) => ['rpc', ...(s(p, 'hopRelayers') === 'direct' ? [] : ['sweep-relayer'])],
    strength: () => ['weak'],
    doesNotHide: (p) => [
      'privacy.warn.hopsWeak',
      'privacy.warn.tabMustStayOpen',
      'privacy.warn.directReadsRevealAddress',
      ...(s(p, 'hopRelayers') === 'same' ? ['privacy.warn.singleRelayerSeesAllHops'] : []),
      ...(s(p, 'hopRelayers') === 'direct' ? ['privacy.warn.gasFundingLink'] : []),
    ],
    paramCheck: (p) => (n(p, 'delayMinMs') > n(p, 'delayMaxMs') ? ['delayMinMs'] : []),
    project: (p) => ({ 'sweep.hops': String(n(p, 'hops')), 'sweep.hopRelayers': s(p, 'hopRelayers') }),
    specRef: SPEC('hops.md', 'HOP-N'),
    maturity: 'poc',
  },
  'hygiene.sweep': {
    kind: 'hygiene.sweep',
    role: 'seller',
    family: 'evm',
    start: false,
    accepts: [{ t: 'stealth', asset: [...ASSETS_PLAIN] }],
    params: { destination: enumP(['self-derived', 'external-fresh', 'external-reuse', 'single-address']) },
    produce: (p, i, c) => ({
      t: 'owned',
      asset: i !== null && 'asset' in i ? i.asset : c.asset,
      origin: s(p, 'destination') === 'self-derived' ? 'self-derived' : 'external',
    }),
    fan: () => 1,
    fanMode: 'outputs',
    waits: false,
    wait: noWait,
    purposes: () => ['relayer', 'rpc'],
    onChain: true,
    fee: () => ({ minBps: SWEEP_RELAYER_FEE_MIN_BPS, maxBps: SWEEP_RELAYER_FEE_MAX_BPS }),
    trust: () => ['rpc', 'sweep-relayer'],
    strength: () => ['hygiene'],
    doesNotHide: (p) => [
      'privacy.warn.contentNotHidden',
      ...(s(p, 'destination') === 'self-derived' ? [] : ['privacy.warn.externalDestinationUnverified']),
      ...(s(p, 'destination') === 'external-reuse' ? ['privacy.warn.destinationReuse'] : []),
    ],
    project: (p) => ({ 'sweep.destination': mapDestination(s(p, 'destination')) }),
    specRef: SPEC('hygiene.md', 'HY-DST'),
    maturity: 'existing',
  },
  'pool.exit': {
    kind: 'pool.exit',
    role: 'seller',
    family: 'evm',
    start: false,
    accepts: [{ t: 'note', holder: ['seller'] }],
    params: {
      partials: intP(1, 8, 1),
      destination: enumP(['fresh-per-exit', 'external-reuse', 'single-address']),
      poolSubmit: enumP(['relayer', 'self']),
      poolAsp: enumP(['none', 'publisher']),
      gapMinMs: intP(0, 7 * 24 * H, 0),
      gapMaxMs: intP(0, 7 * 24 * H, 0),
    },
    produce: (_p, i, c) => ({
      t: 'owned',
      asset: i !== null && 'asset' in i ? i.asset : c.asset,
      origin: 'pool-exit',
    }),
    fan: (p) => n(p, 'partials'),
    fanMode: 'outputs',
    waits: true,
    wait: (p) => ({
      minMs: n(p, 'gapMinMs') * (n(p, 'partials') - 1),
      maxMs: n(p, 'gapMaxMs') * (n(p, 'partials') - 1),
    }),
    purposes: (p) => (s(p, 'poolSubmit') === 'relayer' ? ['pool-relayer'] : ['rpc']),
    onChain: true,
    fee: (p) =>
      s(p, 'poolSubmit') === 'relayer'
        ? { minBps: 0, maxBps: POOL_RELAYER_FEE_BPS_CAP }
        : { minBps: 0, maxBps: 0 },
    trust: (p) => [
      ...(s(p, 'poolSubmit') === 'relayer' ? ['pool-relayer'] : ['rpc']),
      ...(s(p, 'poolAsp') === 'publisher' ? ['asp-publisher'] : []),
    ],
    strength: () => ['crowd-dependent-unlinking'],
    doesNotHide: (p) => [
      'privacy.warn.amountTimingMatch',
      'privacy.warn.ragequitRelinks',
      ...(s(p, 'poolSubmit') === 'self' ? ['privacy.warn.gasFundingLink'] : []),
      ...(s(p, 'poolAsp') === 'publisher' ? ['privacy.warn.aspChoiceDisclosed'] : []),
    ],
    paramCheck: (p) => (n(p, 'gapMinMs') > n(p, 'gapMaxMs') ? ['gapMinMs'] : []),
    project: (p, c) => ({
      ...(c.earlierPool !== null ? { 'sweep.exit': c.earlierPool } : {}),
      'sweep.poolSubmit': s(p, 'poolSubmit'),
      'sweep.poolAsp': s(p, 'poolAsp'),
      ...(s(p, 'destination') === 'external-reuse' ? { 'sweep.destination': 'external-reuse' } : {}),
    }),
    specRef: SPEC('shielded-pool.md', 'SP-EXIT'),
    maturity: 'poc',
  },
  'ct.sweep': {
    kind: 'ct.sweep',
    role: 'seller',
    family: 'evm',
    start: false,
    accepts: [{ t: 'stealth', asset: ['confidential'] }],
    params: {},
    produce: () => ({ t: 'owned', asset: 'confidential', origin: 'self-derived' }),
    fan: () => 1,
    fanMode: 'outputs',
    waits: false,
    wait: noWait,
    purposes: () => ['rpc', 'decrypt-relayer'],
    onChain: true,
    fee: noFee,
    trust: () => ['rpc', 'zama-decrypt-relayer'],
    strength: () => ['amount-confidential'],
    doesNotHide: () => ['privacy.warn.decryptRelayerSees', 'privacy.warn.wrapUnwrapPublic'],
    project: (_p, c) => ({ 'pay.amountVisibility': c.ctBackend }),
    specRef: SPEC('confidential-tokens.md', 'CT-DEC-2'),
    maturity: 'poc',
  },
  'ct.unwrap': {
    kind: 'ct.unwrap',
    role: 'seller',
    family: 'evm',
    start: false,
    accepts: [{ t: 'stealth', asset: ['confidential'] }],
    params: {},
    produce: () => ({ t: 'stealth', asset: 'erc20', origin: 'router' }),
    fan: () => 1,
    fanMode: 'outputs',
    waits: false,
    wait: noWait,
    purposes: () => ['rpc'],
    onChain: true,
    fee: noFee,
    trust: () => ['rpc'],
    strength: () => none,
    doesNotHide: () => ['privacy.warn.wrapUnwrapPublic'],
    project: () => ({}),
    specRef: SPEC('confidential-tokens.md', 'CT-DEC-2'),
    maturity: 'poc',
  },
  'btc.send': {
    kind: 'btc.send',
    role: 'payer',
    family: 'btc',
    start: true,
    accepts: [{ t: 'btc-utxo' }],
    params: {
      mode: enumP(['silent-payment', 'plain', 'payjoin-v2', 'payjoin-v1']),
      locktime: enumP(['zero', 'height']),
      silentPaymentOutput: boolP(false),
    },
    produce: () => ({ t: 'paid' }),
    fan: () => 1,
    fanMode: 'outputs',
    waits: false,
    wait: noWait,
    purposes: (p) => (isPayjoin(s(p, 'mode')) ? ['rpc', 'payjoin-directory'] : ['rpc']),
    onChain: true,
    fee: noFee,
    trust: (p) => [
      'rpc',
      ...(s(p, 'mode') === 'payjoin-v2' ? ['payjoin-directory', 'payjoin-ohttp-relay'] : []),
    ],
    strength: (p) => (isPayjoin(s(p, 'mode')) ? ['friction'] : ['baseline']),
    doesNotHide: (p) =>
      isPayjoin(s(p, 'mode')) ? payjoinLeaks(s(p, 'mode')) : ['privacy.warn.payerStillPublic'],
    project: (p) => ({ 'btc.mode': s(p, 'mode'), 'btc.locktime': s(p, 'locktime') }),
    specRef: SPEC('btc-payjoin.md', 'BPJ-URI-2', 'BPJ-SP-1'),
    maturity: 'poc',
  },
  'btc.recv': {
    kind: 'btc.recv',
    role: 'seller',
    family: 'btc',
    start: true,
    accepts: [],
    params: {
      mode: enumP(['silent-payment', 'plain', 'payjoin-v2', 'payjoin-v1']),
      silentPaymentOutput: boolP(false),
    },
    produce: (p) => ({
      t: 'btc-utxo',
      kind: s(p, 'mode') === 'silent-payment' ? 'sp' : s(p, 'mode') === 'plain' ? 'plain' : 'payjoin-addr',
    }),
    fan: () => 1,
    fanMode: 'outputs',
    waits: false,
    wait: noWait,
    purposes: (p) => (isPayjoin(s(p, 'mode')) ? ['payjoin-directory'] : ['scan']),
    onChain: false,
    fee: noFee,
    trust: (p) => (s(p, 'mode') === 'payjoin-v2' ? ['payjoin-directory', 'payjoin-ohttp-relay'] : []),
    strength: () => ['baseline'],
    doesNotHide: (p) =>
      isPayjoin(s(p, 'mode')) ? payjoinLeaks(s(p, 'mode')) : ['privacy.warn.contentNotHidden'],
    project: (p) => ({ 'btc.mode': s(p, 'mode') }),
    specRef: SPEC('btc-payjoin.md', 'BPJ-URI-2'),
    maturity: 'poc',
  },
  'btc.payjoin-contribute': {
    kind: 'btc.payjoin-contribute',
    role: 'seller',
    family: 'btc',
    start: false,
    accepts: [{ t: 'btc-utxo', kind: ['sp'] }],
    params: { mode: enumP(['payjoin-v2', 'payjoin-v1']) },
    produce: () => ({ t: 'btc-utxo', kind: 'payjoin-addr' }),
    fan: () => 1,
    fanMode: 'outputs',
    waits: false,
    wait: noWait,
    purposes: () => ['payjoin-directory'],
    onChain: true,
    fee: noFee,
    trust: (p) => (s(p, 'mode') === 'payjoin-v2' ? ['payjoin-directory', 'payjoin-ohttp-relay'] : []),
    strength: () => ['friction'],
    doesNotHide: (p) => payjoinLeaks(s(p, 'mode')),
    project: (p) => ({ 'btc.mode': s(p, 'mode'), 'btc.contributeFromSp': 'on' }),
    specRef: SPEC('btc-payjoin.md', 'BPJ-RCV-9'),
    maturity: 'poc',
  },
};

function payjoinLeaks(mode: string): readonly string[] {
  return [
    'privacy.warn.payjoinNoSilentPayment',
    'privacy.warn.payjoinFallbackBroadcast',
    'privacy.warn.payjoinUtxoProbing',
    ...(mode === 'payjoin-v2' ? ['privacy.warn.payjoinDirectorySees'] : []),
  ];
}

/** All step kinds, in catalogue order. */
export const STEP_KINDS: readonly StepKind[] = Object.keys(STEP_CATALOGUE) as StepKind[];

/** True when `k` names a catalogue step. Own-property check: `__proto__` and friends are not kinds. */
export function isStepKind(k: unknown): k is StepKind {
  return typeof k === 'string' && Object.prototype.hasOwnProperty.call(STEP_CATALOGUE, k);
}

/**
 * Result of normalising a step's parameters against its closed schema.
 * `errors` lists offending parameter names (unknown keys, bad types, out of range).
 */
export function normalizeParams(
  kind: StepKind,
  raw: Readonly<Record<string, unknown>> | undefined,
): { params: StepParams; errors: readonly string[] } {
  const schema = STEP_CATALOGUE[kind].params;
  const out: Record<string, ParamValue> = {};
  const errors: string[] = [];
  for (const [k, spec] of Object.entries(schema)) out[k] = spec.default;
  if (raw !== undefined) {
    for (const k of Object.keys(raw).sort()) {
      const spec = Object.prototype.hasOwnProperty.call(schema, k) ? schema[k] : undefined;
      const v = raw[k];
      if (spec === undefined) {
        errors.push(k);
        continue;
      }
      if (v === undefined) continue;
      const ok =
        spec.type === 'enum'
          ? typeof v === 'string' && spec.values.includes(v)
          : spec.type === 'int'
            ? typeof v === 'number' && Number.isInteger(v) && v >= spec.min && v <= spec.max
            : spec.type === 'bool'
              ? typeof v === 'boolean'
              : typeof v === 'string' && v.length <= spec.maxLen && /^[0-9]*$/.test(v);
      if (ok) out[k] = v as ParamValue;
      else errors.push(k);
    }
  }
  return { params: out, errors };
}
