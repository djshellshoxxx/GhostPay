/**
 * Option catalogue: every privacy option of the ten method specs as typed data.
 * Data only: no imports of any method package. Copy text lives in the apps, keyed by the ids here.
 * @security Every non-default value carries `privacy.warn.noAnonymity` and a non-empty `doesNotHide` list.
 */
import type {
  AckKey,
  Action,
  AssetKind,
  Capability,
  Chain,
  Env,
  GroupId,
  LeakKey,
  Maturity,
  OptionDef,
  OptionId,
  Pred,
  Scope,
  StrengthClass,
  TrustParty,
  ValueDef,
  WarningKey,
} from './types.js';
import { OPTION_IDS } from './types.js';

/** Input row for one value; warnings and acks are bare names. */
interface VIn {
  readonly v: string;
  readonly ids: readonly string[];
  readonly file?: string;
  readonly mat?: Maturity;
  readonly str?: StrengthClass;
  readonly req?: readonly Capability[];
  readonly any?: readonly Capability[];
  readonly env?: readonly Env[];
  readonly chains?: readonly Chain[];
  readonly assets?: readonly AssetKind[];
  readonly trust?: readonly TrustParty[];
  readonly hides?: readonly LeakKey[];
  readonly dnh?: readonly LeakKey[];
  readonly w?: readonly string[];
  readonly ack?: readonly string[];
  readonly copy?: readonly string[];
}

interface OIn {
  readonly id: OptionId;
  readonly group: GroupId;
  readonly scope?: Scope;
  readonly def: string;
  readonly file: string;
  readonly str: StrengthClass;
  readonly build: string | null;
  readonly dnh: readonly LeakKey[];
  readonly selectable?: boolean;
  readonly active?: Pred;
  readonly values: readonly VIn[];
}

const ALL_ACTIONS: readonly Action[] = [
  'settings',
  'create-invoice',
  'pay',
  'scan',
  'sweep',
  'btc-receive',
  'btc-send',
];
const GROUP_ACTIONS: Readonly<Record<GroupId, readonly Action[]>> = {
  sweep: ['sweep', 'settings'],
  pay: ['pay', 'settings'],
  invoice: ['create-invoice', 'scan', 'settings'],
  network: ALL_ACTIONS,
  btc: ['btc-receive', 'btc-send', 'settings'],
  operator: ['settings'],
};
const GROUP_SCOPE: Readonly<Record<GroupId, Scope>> = {
  sweep: 'seller',
  pay: 'payer',
  invoice: 'seller',
  network: 'both',
  btc: 'both',
  operator: 'deployment',
};

const DNH_CHAIN: readonly LeakKey[] = ['common:payer-address', 'common:amount', 'common:token', 'common:timing'];
const DNH_POOL: readonly LeakKey[] = [
  'pools:deposit-public',
  'pools:crowd-small',
  'pools:amount-timing-match',
  'pools:relayer-sees-destination',
  'pools:exit-gas-funding-link',
];
const DNH_NET: readonly LeakKey[] = ['network:content', 'network:timing', 'common:payer-address', 'common:amount'];
const DNH_BTC: readonly LeakKey[] = ['btc:addresses-public', 'btc:amount', 'btc:timing'];
const DNH_OPS: readonly LeakKey[] = ['ops:deployment-dependent'];

function warnKey(name: string): WarningKey {
  return `privacy.warn.${name}`;
}
function ackKey(name: string): AckKey {
  return `privacy.ack.${name}`;
}

function build(o: OIn): OptionDef {
  const values: ValueDef[] = o.values.map((r) => {
    const isDef = r.v === o.def;
    const baseline = (r.str ?? o.str) === 'baseline';
    const warnings = ['testnetOnly', ...(r.w ?? [])];
    if (!isDef && !baseline) warnings.push('noAnonymity');
    return {
      value: r.v,
      specRef: { file: r.file ?? o.file, ids: r.ids },
      maturity: r.mat ?? 'poc',
      strength: r.str ?? o.str,
      requires: r.req ?? [],
      ...(r.any ? { requiresAny: r.any } : {}),
      ...(r.env ? { env: r.env } : {}),
      ...(r.chains ? { chains: r.chains } : {}),
      ...(r.assets ? { assets: r.assets } : {}),
      trust: r.trust ?? [],
      hides: r.hides ?? [],
      doesNotHide: isDef ? (r.dnh ?? []) : (r.dnh ?? o.dnh),
      warnings: [...new Set(warnings)].map(warnKey),
      acks: (r.ack ?? []).map(ackKey),
      specCopyKeys: r.copy ?? [],
      buildPackage: o.build,
    };
  });
  return {
    id: o.id,
    group: o.group,
    scope: o.scope ?? GROUP_SCOPE[o.group],
    actions: GROUP_ACTIONS[o.group],
    userSelectable: o.selectable ?? true,
    defaultValue: o.def,
    values,
    ...(o.active ? { activeWhen: o.active } : {}),
  };
}

const POOL_EXITS = ['privacy-pools', 'railgun', 'shielded-pool', 'mock-pool'] as const;
const SPONSORED = ['permit-relay', 'eip7702-sponsored', 'erc4337-paymaster'] as const;

const POOL_WARN = ['depositPublic', 'crowdTiny', 'ragequitRelinks'];

/** Network profile rows, shared by the RPC and relayer roles. */
function netValues(role: 'rpc' | 'relayer'): readonly VIn[] {
  const f = 'network-privacy.md';
  const t = (c: Capability): readonly Capability[] => [c];
  const common = ['contentNotHidden', 'timingNotHidden', 'walletRpcOutsideApp'];
  const sel = role === 'rpc' ? 'NP-S-1' : 'NP-S-2';
  return [
    { v: 'direct', ids: ['NP-P-1'], mat: 'existing', str: 'baseline', file: f },
    {
      v: 'tor-browser',
      ids: ['NP-B-4', sel],
      env: ['web', 'web-onion'],
      req: t('tor-browser-asserted'),
      trust: ['tor-network', 'tor-exit'],
      w: [...common, 'torExitSeesHost'],
      str: 'network-origin',
    },
    {
      v: 'tor-socks',
      ids: ['NP-P-2', sel],
      env: ['node'],
      req: t('tor-socks'),
      trust: ['tor-network', 'tor-exit'],
      w: [...common, 'torExitSeesHost'],
      str: 'network-origin',
    },
    {
      v: 'onion',
      ids: ['NP-O-1', sel],
      env: ['web-onion', 'node'],
      req: t(role === 'rpc' ? 'onion-rpc' : 'onion-relayer'),
      trust: ['tor-network'],
      w: common,
      str: 'network-origin',
    },
    {
      v: 'i2p-outproxy',
      ids: ['NP-I2P-1', sel],
      env: ['node'],
      req: t('i2p-proxy'),
      trust: ['i2p-outproxy'],
      mat: 'poc',
      w: [...common, 'outproxySeesDestination'],
      str: 'network-origin',
    },
    {
      v: 'nym-mixfetch',
      ids: ['NP-N-1', sel],
      env: ['web'],
      req: t('nym-build'),
      trust: ['nym-mixnet'],
      mat: 'experimental',
      w: [...common, 'nymDestinationGroups', 'experimental'],
      str: 'network-origin',
    },
    {
      v: 'nym-socks5',
      ids: ['NP-N-2', sel],
      env: ['node'],
      req: t('nym-socks5'),
      trust: ['nym-mixnet'],
      mat: 'experimental',
      w: [...common, 'nymDestinationGroups', 'experimental'],
      str: 'network-origin',
    },
    {
      v: 'ohttp',
      ids: ['NP-H-1', sel],
      req: t(role === 'rpc' ? 'ohttp-gateway-rpc' : 'ohttp-gateway-relayer'),
      trust: ['ohttp-relay', 'ohttp-gateway'],
      w: [...common, 'ohttpNonCollusion'],
      str: 'network-origin',
    },
  ];
}

const bool = (ids: readonly string[], extra: Partial<VIn> = {}): readonly VIn[] => [
  { v: 'off', ids, mat: 'existing' },
  { v: 'on', ids, ...extra },
];

const OPTION_INPUTS: readonly OIn[] = [
  // ---- 7.1 sweep
  {
    id: 'sweep.destination',
    group: 'sweep',
    def: 'self-derived',
    file: 'hygiene.md',
    str: 'hygiene',
    build: 'packages/hygiene',
    dnh: DNH_CHAIN,
    values: [
      { v: 'self-derived', ids: ['HY-DST'], mat: 'existing', hides: ['hygiene:L4'] },
      { v: 'external-fresh', ids: ['HY-DST'], w: ['externalDestinationUnverified'] },
      { v: 'external-reuse', ids: ['HY-DST', 'HY-CON'], w: ['externalDestinationUnverified', 'destinationReuse'], ack: ['destinationReuse'] },
    ],
  },
  {
    id: 'sweep.verification',
    group: 'sweep',
    def: 'address-free',
    file: 'hygiene.md',
    str: 'hygiene',
    build: 'packages/hygiene',
    dnh: DNH_CHAIN,
    values: [
      { v: 'address-free', ids: ['HY-VER'], hides: ['hygiene:L7'] },
      { v: 'direct', ids: ['HY-VER'], trust: ['rpc'], w: ['directReadsRevealAddress'] },
    ],
  },
  {
    id: 'sweep.dust',
    group: 'sweep',
    def: 'on',
    file: 'hygiene.md',
    str: 'hygiene',
    build: 'packages/hygiene',
    dnh: DNH_CHAIN,
    values: [
      { v: 'on', ids: ['HY-DUST-1'] },
      { v: 'off', ids: ['HY-DUST-1'] },
    ],
  },
  {
    id: 'sweep.knownWalletGuard',
    group: 'sweep',
    def: 'on',
    file: 'hygiene.md',
    str: 'hygiene',
    build: 'packages/hygiene',
    dnh: DNH_CHAIN,
    values: [
      { v: 'on', ids: ['HY-FUND'] },
      { v: 'off', ids: ['HY-FUND'], w: ['knownWalletGuardOff'] },
    ],
  },
  {
    id: 'sweep.delay',
    group: 'sweep',
    def: 'off',
    file: 'amount-blurring.md',
    str: 'friction',
    build: 'packages/amount-blur',
    dnh: DNH_CHAIN,
    values: [
      { v: 'off', ids: ['AB-DELAY'] },
      { v: 'jitter', ids: ['AB-DELAY'], w: ['tabMustStayOpen', 'timingNotHidden'], copy: ['ABCopy'] },
    ],
  },
  {
    id: 'sweep.hops',
    group: 'sweep',
    def: '0',
    file: 'hops.md',
    str: 'weak',
    build: 'packages/hops',
    dnh: ['hops:every-hop-followable', 'hops:amounts-linkable', ...DNH_CHAIN],
    values: [
      { v: '0', ids: ['HOP-0'] },
      ...(['1', '2', '3', '4'] as const).map(
        (n): VIn => ({
          v: n,
          ids: ['HOP-N', 'HOP-REQ-1'],
          trust: ['sweep-relayer'],
          w: ['hopsWeak', 'tabMustStayOpen', 'directReadsRevealAddress'],
          ack: ['hopsWeak'],
          hides: ['hops:single-edge-lookup'],
          copy: ['HOP_LABELS'],
        }),
      ),
    ],
  },
  {
    id: 'sweep.hopRelayers',
    group: 'sweep',
    def: 'rotate',
    file: 'hops.md',
    str: 'weak',
    build: 'packages/hops',
    dnh: ['hops:every-hop-followable', ...DNH_CHAIN],
    values: [
      { v: 'rotate', ids: ['HOP-RLY-1'], trust: [] },
      { v: 'same', ids: ['HOP-RLY-1'], trust: ['sweep-relayer'], w: ['singleRelayerSeesAllHops'] },
      { v: 'direct', ids: ['HOP-REQ-12'], w: ['gasFundingLink'] },
    ],
  },
  {
    id: 'sweep.exit',
    group: 'sweep',
    def: 'plain',
    file: 'external-pools.md',
    str: 'crowd-dependent-unlinking',
    build: 'packages/external-pools*, packages/shielded-pool*',
    dnh: DNH_POOL,
    values: [
      { v: 'plain', ids: ['EP-0'], mat: 'existing', str: 'baseline' },
      {
        v: 'privacy-pools',
        ids: ['EP-1', 'EP-PP-1'],
        req: ['manifest:privacy-pools'],
        trust: ['privacy-pools-operator', 'privacy-pools-asp', 'third-party-unaudited-code'],
        w: [...POOL_WARN, 'thirdPartyUnaudited'],
        ack: ['poolDisclosure'],
        mat: 'spike-gated',
        hides: ['pools:s1-to-exit-link-within-crowd'],
        copy: ['EXIT_ROUTE_INFO'],
      },
      {
        v: 'railgun',
        ids: ['EP-2', 'EP-RG-1'],
        req: ['manifest:railgun'],
        trust: ['railgun-ppoi', 'third-party-unaudited-code'],
        w: [...POOL_WARN, 'thirdPartyUnaudited'],
        ack: ['poolDisclosure'],
        mat: 'spike-gated',
        hides: ['pools:s1-to-exit-link-within-crowd'],
        copy: ['EXIT_ROUTE_INFO'],
      },
      {
        v: 'shielded-pool',
        ids: ['SP-EXIT'],
        file: 'shielded-pool.md',
        req: ['manifest:shielded-pool'],
        trust: ['own-circuits-dev-ceremony', 'own-unaudited-contracts'],
        w: [...POOL_WARN, 'insecureCeremony', 'ownContractsUnaudited'],
        ack: ['poolDisclosure', 'shieldedPoolTestnet'],
        hides: ['pools:s1-to-exit-link-within-crowd'],
        copy: ['SP_OPTION_INFO'],
      },
      {
        v: 'mock-pool',
        ids: ['EP-M'],
        req: ['test-mode'],
        mat: 'test-only',
        str: 'baseline',
        w: ['mockNoPrivacy'],
        copy: ['EXIT_ROUTE_INFO'],
      },
      { v: 'tornado-fixed', ids: ['EP-3'], mat: 'stub', copy: ['EXIT_ROUTE_INFO'] },
      { v: 'aztec', ids: ['EP-4'], mat: 'watch', copy: ['EXIT_ROUTE_INFO'] },
    ],
  },
  {
    id: 'sweep.poolAsp',
    group: 'sweep',
    def: 'none',
    file: 'shielded-pool.md',
    str: 'crowd-dependent-unlinking',
    build: 'packages/shielded-pool',
    dnh: DNH_POOL,
    active: { opt: 'sweep.exit', in: ['shielded-pool'] },
    values: [
      { v: 'none', ids: ['SP-ASP'] },
      { v: 'publisher', ids: ['SP-ASP'], req: ['asp-publisher'], trust: ['asp-publisher'], w: ['aspChoiceDisclosed'] },
    ],
  },
  {
    id: 'sweep.poolSubmit',
    group: 'sweep',
    def: 'relayer',
    file: 'shielded-pool.md',
    str: 'crowd-dependent-unlinking',
    build: 'packages/shielded-pool*, packages/external-pools*',
    dnh: DNH_POOL,
    active: { opt: 'sweep.exit', in: [...POOL_EXITS] },
    values: [
      { v: 'relayer', ids: ['SP-REL'], trust: ['pool-relayer'] },
      { v: 'self', ids: ['SP-REL'], w: ['gasFundingLink'] },
    ],
  },
  {
    id: 'sweep.poolAmountPlan',
    group: 'sweep',
    def: 'denominations',
    file: 'shielded-pool.md',
    str: 'friction',
    build: 'packages/amount-blur',
    dnh: DNH_POOL,
    active: { opt: 'sweep.exit', in: [...POOL_EXITS] },
    values: [
      { v: 'denominations', ids: ['SP-SDK-8'] },
      { v: 'whole', ids: ['SP-SDK-8'], w: ['amountTimingMatch'] },
    ],
  },
  {
    id: 'sweep.exitGas',
    group: 'sweep',
    def: 'buffer',
    file: 'shielded-pool.md',
    str: 'crowd-dependent-unlinking',
    build: 'packages/shielded-pool*, packages/external-pools*, packages/payer-hiding',
    dnh: DNH_POOL,
    active: { opt: 'sweep.exit', in: [...POOL_EXITS] },
    values: [
      { v: 'buffer', ids: ['SP-SDK-1'] },
      { v: 'permit-sponsored', ids: ['SP-SDK-1'], req: ['pool-relayer'], assets: ['erc20-permit'], trust: ['pool-relayer'] },
      { v: 'topup', ids: ['EP-GEN'], file: 'external-pools.md', w: ['gasFundingLink'] },
      { v: 'eip7702', ids: ['PH-3'], file: 'payer-hiding.md', req: ['eip7702'], mat: 'spike-gated', w: ['persistent7702Delegate'] },
    ],
  },
  // ---- 7.2 payer
  {
    id: 'pay.payerMode',
    group: 'pay',
    def: 'direct',
    file: 'payer-hiding.md',
    str: 'friction',
    build: 'packages/payer-hiding*, apps/payer-sponsor',
    dnh: ['payer-hiding:payer-address-public', 'payer-hiding:token-funding-link', 'common:amount', 'common:token'],
    values: [
      { v: 'direct', ids: ['PH-0'], mat: 'existing' },
      {
        v: 'fresh-wallet',
        ids: ['PH-1', 'PH-GEN-5'],
        str: 'hygiene',
        w: ['payerStillPublic', 'tokenFundingLink'],
        ack: ['payerStillPublic'],
        hides: ['payer-hiding:long-lived-wallet-as-sender'],
        copy: ['PAYER_MODE_INFO'],
      },
      {
        v: 'permit-relay',
        ids: ['PH-2', 'PH-GEN-5'],
        req: ['payer-sponsor'],
        assets: ['erc20-permit'],
        trust: ['payer-sponsor', 'own-unaudited-contracts'],
        w: ['payerStillPublic', 'sponsorSees', 'tokenFundingLink'],
        ack: ['payerStillPublic'],
        hides: ['payer-hiding:native-gas-funding-link'],
        copy: ['PAYER_MODE_INFO'],
      },
      {
        v: 'eip7702-sponsored',
        ids: ['PH-3', 'PH-GEN-5'],
        req: ['payer-sponsor', 'eip7702'],
        mat: 'spike-gated',
        trust: ['payer-sponsor', 'own-unaudited-contracts'],
        w: ['payerStillPublic', 'sponsorSees', 'tokenFundingLink', 'persistent7702Delegate'],
        ack: ['payerStillPublic'],
        hides: ['payer-hiding:native-gas-funding-link'],
        copy: ['PAYER_MODE_INFO'],
      },
      {
        v: 'erc4337-paymaster',
        ids: ['PH-4', 'PH-GEN-5'],
        req: ['erc4337-entrypoint', 'erc4337-paymaster'],
        mat: 'spike-gated',
        trust: ['bundler', 'paymaster', 'own-unaudited-contracts'],
        w: ['payerStillPublic', 'sponsorSees', 'tokenFundingLink'],
        ack: ['payerStillPublic'],
        hides: ['payer-hiding:native-gas-funding-link'],
        copy: ['PAYER_MODE_INFO'],
      },
    ],
  },
  {
    id: 'pay.source',
    group: 'pay',
    def: 'wallet',
    file: 'shielded-pool.md',
    str: 'crowd-dependent-unlinking',
    build: 'packages/shielded-pool',
    dnh: DNH_POOL,
    values: [
      { v: 'wallet', ids: ['SP-PAY'], mat: 'existing' },
      {
        v: 'shielded-pool',
        ids: ['SP-PAY'],
        req: ['manifest:shielded-pool', 'pool-note', 'pool-relayer'],
        trust: ['pool-relayer', 'own-circuits-dev-ceremony', 'own-unaudited-contracts'],
        w: ['crowdTiny', 'depositPublic', 'insecureCeremony'],
        ack: ['shieldedPoolTestnet'],
        hides: ['pools:payer-address-on-payment'],
        copy: ['SP_OPTION_INFO'],
      },
    ],
  },
  {
    id: 'pay.amountBlur',
    group: 'pay',
    def: 'off',
    file: 'amount-blurring.md',
    str: 'friction',
    build: 'packages/amount-blur',
    dnh: ['amount-blur:amount-visible-on-chain', 'common:payer-address', 'common:timing'],
    values: [
      { v: 'off', ids: ['AB-HON'] },
      { v: 'delay', ids: ['AB-DELAY'], mat: 'existing', w: ['tabMustStayOpen'], copy: ['ABCopy'] },
      { v: 'round', ids: ['AB-ROUND'], w: ['roundUpCost'], copy: ['ABCopy'] },
      { v: 'split', ids: ['AB-SPLIT'], w: ['tabMustStayOpen', 'fanOutLinkable'], copy: ['ABCopy'] },
      { v: 'denom', ids: ['AB-DENOM'], w: ['tabMustStayOpen', 'fanOutLinkable'], copy: ['ABCopy'] },
    ],
  },
  {
    id: 'pay.amountVisibility',
    group: 'pay',
    def: 'public',
    file: 'confidential-tokens.md',
    str: 'amount-confidential',
    build: 'packages/confidential-*',
    dnh: ['ct:edges-token-time-public', 'ct:wrap-unwrap-amounts-public', 'ct:decryptor-trust', 'common:payer-address'],
    values: [
      { v: 'public', ids: ['CT-0'], mat: 'existing', str: 'baseline' },
      {
        v: 'ct1-zama',
        ids: ['CT-1'],
        chains: [11155111],
        req: ['manifest:confidential-ct1', 'seller-accepts-ct'],
        trust: ['zama-kms-coprocessors', 'zama-decrypt-relayer'],
        w: ['wrapUnwrapPublic', 'fheOperatorTrust', 'decryptRelayerSees', 'zeroTransferAmbiguity'],
        ack: ['ctTrust'],
        hides: ['ct:amount-on-chain'],
        copy: ['CTCopy'],
      },
      {
        v: 'ct2-fhenix',
        ids: ['CT-2'],
        req: ['manifest:confidential-ct2'],
        mat: 'spike-gated',
        trust: ['fhenix-network'],
        w: ['wrapUnwrapPublic', 'fheOperatorTrust', 'decryptRelayerSees', 'zeroTransferAmbiguity'],
        ack: ['ctTrust'],
        hides: ['ct:amount-on-chain'],
        copy: ['CTCopy'],
      },
      {
        v: 'ct3-inco',
        ids: ['CT-3'],
        chains: [84532],
        req: ['manifest:confidential-ct3'],
        mat: 'spike-gated',
        trust: ['inco-tee'],
        w: ['wrapUnwrapPublic', 'teeTrust', 'decryptRelayerSees', 'zeroTransferAmbiguity'],
        ack: ['ctTrust'],
        hides: ['ct:amount-on-chain'],
        copy: ['CTCopy'],
      },
      { v: 'ctm-cleartext', ids: ['CT-M'], chains: [31337], req: ['test-mode'], mat: 'test-only', str: 'baseline', w: ['mockNoPrivacy'], copy: ['CTCopy'] },
    ],
  },
  {
    id: 'pay.bufferRounding',
    group: 'pay',
    def: 'grid125',
    file: 'hygiene.md',
    str: 'hygiene',
    build: 'packages/hygiene',
    dnh: DNH_CHAIN,
    values: [
      { v: 'grid125', ids: ['HY-BUF'], assets: ['erc20', 'erc20-permit'], hides: ['hygiene:L9'] },
      { v: 'sig2', ids: ['HY-BUF'], assets: ['erc20', 'erc20-permit'] },
      { v: 'off', ids: ['HY-BUF'], assets: ['erc20', 'erc20-permit'], w: ['bufferFingerprint'] },
    ],
  },
  {
    id: 'pay.route',
    group: 'pay',
    def: 'router',
    file: 'metadata-hardening.md',
    str: 'hygiene',
    build: null,
    dnh: DNH_CHAIN,
    values: [
      { v: 'router', ids: ['MH-FEE-1'], mat: 'existing' },
      { v: 'direct-no-fee', ids: ['MH-FEE-1'], w: ['directNoFeeScanner'] },
    ],
  },
  {
    id: 'pay.amountNoise',
    group: 'pay',
    def: 'off',
    file: 'metadata-hardening.md',
    str: 'friction',
    build: null,
    dnh: DNH_CHAIN,
    values: bool(['MH-AMT-2'], { w: ['roundUpCost'] }),
  },
  {
    id: 'pay.gasNormalise',
    group: 'pay',
    def: 'off',
    file: 'metadata-hardening.md',
    str: 'hygiene',
    build: null,
    dnh: DNH_CHAIN,
    values: bool(['MH-WAL-1']),
  },
  // ---- 7.3 invoice, identity, announcement
  { id: 'invoice.encrypt', group: 'invoice', def: 'off', file: 'metadata-hardening.md', str: 'hygiene', build: null, dnh: DNH_CHAIN, values: bool(['MH-INV-2']) },
  { id: 'invoice.padding', group: 'invoice', def: 'off', file: 'metadata-hardening.md', str: 'hygiene', build: null, dnh: DNH_CHAIN, values: bool(['MH-INV-1']) },
  { id: 'invoice.coarseTime', group: 'invoice', def: 'off', file: 'metadata-hardening.md', str: 'hygiene', build: null, dnh: DNH_CHAIN, values: bool(['MH-INV-3']) },
  {
    id: 'invoice.quoteRounding',
    group: 'invoice',
    def: 'on',
    file: 'metadata-hardening.md',
    str: 'friction',
    build: 'packages/amount-blur',
    dnh: DNH_CHAIN,
    values: [
      { v: 'on', ids: ['MH-AMT-1'], w: ['roundUpCost'] },
      { v: 'off', ids: ['MH-AMT-1'] },
    ],
  },
  {
    id: 'identity.perInvoiceMeta',
    group: 'invoice',
    def: 'off',
    file: 'metadata-hardening.md',
    str: 'hygiene',
    build: null,
    dnh: DNH_CHAIN,
    values: bool(['MH-ID-1'], { w: ['perInvoiceSignerUnpinned'] }),
  },
  { id: 'identity.perChainKeys', group: 'invoice', def: 'off', file: 'metadata-hardening.md', str: 'hygiene', build: null, dnh: DNH_CHAIN, values: bool(['MH-ID-2']) },
  {
    id: 'announce.metadata',
    group: 'invoice',
    def: 'standard',
    file: 'metadata-hardening.md',
    str: 'hygiene',
    build: null,
    dnh: DNH_CHAIN,
    values: [
      { v: 'standard', ids: ['MH-ANN-3'], mat: 'existing' },
      { v: 'minimal', ids: ['MH-ANN-3'] },
    ],
  },
  {
    id: 'announce.viewTag',
    group: 'invoice',
    def: 'keep',
    file: 'metadata-hardening.md',
    str: 'hygiene',
    build: null,
    dnh: DNH_CHAIN,
    values: [
      { v: 'keep', ids: ['MH-TAG-1'], mat: 'existing' },
      { v: 'mask', ids: ['MH-TAG-1', 'MH-TAG-2'], w: ['tagMaskInterop'] },
    ],
  },
  {
    id: 'announce.schemeId',
    group: 'invoice',
    def: '1',
    file: 'metadata-hardening.md',
    str: 'hygiene',
    build: null,
    dnh: DNH_CHAIN,
    values: [
      { v: '1', ids: ['MH-ANN-1'], mat: 'existing' },
      { v: 'ghostpay', ids: ['MH-ANN-1', 'MH-ANN-2'], w: ['schemeIdFingerprint'] },
    ],
  },
  // ---- 7.4 network
  { id: 'net.rpcProfile', group: 'network', def: 'direct', file: 'network-privacy.md', str: 'network-origin', build: 'packages/net-transport', dnh: [...DNH_NET, 'network:N1'], values: netValues('rpc') },
  { id: 'net.relayerProfile', group: 'network', def: 'direct', file: 'network-privacy.md', str: 'network-origin', build: 'packages/net-transport', dnh: [...DNH_NET, 'network:N2'], values: netValues('relayer') },
  {
    id: 'net.rpcMode',
    group: 'network',
    def: 'single',
    file: 'network-privacy.md',
    str: 'integrity-only',
    build: 'packages/net-transport',
    dnh: ['network:rpc-sees-queries', ...DNH_NET],
    values: [
      { v: 'single', ids: ['NP-S-1'], mat: 'existing' },
      { v: 'quorum', ids: ['MH-NET-2'], file: 'metadata-hardening.md', req: ['multi-rpc'] },
      { v: 'own-node', ids: ['MH-NET-3'], file: 'metadata-hardening.md', req: ['own-node'] },
      { v: 'light-client', ids: ['NP-L-1'], req: ['light-client'], trust: ['light-client-checkpoint'], w: ['lightClientIntegrityOnly'], str: 'integrity-only' },
    ],
  },
  {
    id: 'net.endpointSeparation',
    group: 'network',
    def: 'off',
    file: 'metadata-hardening.md',
    str: 'hygiene',
    build: null,
    dnh: DNH_NET,
    values: [
      { v: 'off', ids: ['MH-NET-1'], mat: 'existing' },
      { v: 'on', ids: ['MH-NET-1', 'PO-RPC-4'], req: ['multi-rpc'], trust: ['rpc'] },
    ],
  },
  {
    id: 'net.scanMode',
    group: 'network',
    def: 'range',
    file: 'network-privacy.md',
    str: 'network-origin',
    build: 'packages/scan-source, packages/pir-two-server',
    dnh: ['network:scan-window', ...DNH_NET],
    values: [
      { v: 'range', ids: ['NP-S-1'], mat: 'existing' },
      { v: 'indexer-tor', ids: ['MH-SCAN-1'], file: 'metadata-hardening.md', req: ['tor-indexer'], trust: ['indexer'] },
      { v: 'pir2', ids: ['MH-SCAN-3'], file: 'metadata-hardening.md', req: ['pir-servers'], trust: ['pir-server-pair'], w: ['pirNonCollusion'] },
      { v: 'light-client', ids: ['NP-L-1'], req: ['light-client'], trust: ['light-client-checkpoint'], w: ['lightClientIntegrityOnly'] },
    ],
  },
  {
    id: 'net.scanAlign',
    group: 'network',
    def: 'off',
    file: 'metadata-hardening.md',
    str: 'hygiene',
    build: null,
    dnh: DNH_NET,
    values: bool(['MH-SCAN-2']),
  },
  {
    id: 'relayer.multi',
    group: 'network',
    def: 'off',
    file: 'metadata-hardening.md',
    str: 'hygiene',
    build: null,
    dnh: DNH_NET,
    values: bool(['MH-REL-4'], { req: ['multi-relayer'], trust: ['sweep-relayer'] }),
  },
  {
    id: 'relayer.padding',
    group: 'network',
    def: 'off',
    file: 'metadata-hardening.md',
    str: 'hygiene',
    build: null,
    dnh: DNH_NET,
    values: bool(['MH-REL-3'], { req: ['sweep-relayer'] }),
  },
  // ---- 7.5 bitcoin
  {
    id: 'btc.mode',
    group: 'btc',
    def: 'silent-payment',
    file: 'btc-payjoin.md',
    str: 'tx-structure',
    build: 'packages/btc-payjoin',
    dnh: DNH_BTC,
    values: [
      { v: 'silent-payment', ids: ['BPJ-SP-1'], mat: 'existing', copy: ['BTC_MODE_INFO'] },
      { v: 'plain', ids: ['BPJ-GEN-1'], mat: 'existing', copy: ['BTC_MODE_INFO'] },
      {
        v: 'payjoin-v2',
        ids: ['BPJ-V2-1'],
        req: ['payjoin-directory', 'payjoin-ffi'],
        env: ['node'],
        trust: ['payjoin-directory', 'payjoin-ohttp-relay'],
        w: ['payjoinNoSilentPayment', 'payjoinFallbackBroadcast', 'payjoinUtxoProbing', 'payjoinDirectorySees'],
        copy: ['BTC_MODE_INFO'],
      },
      {
        v: 'payjoin-v1',
        ids: ['BPJ-GEN-1'],
        req: ['payjoin-v1-endpoint'],
        w: ['payjoinNoSilentPayment', 'payjoinFallbackBroadcast', 'payjoinUtxoProbing'],
        copy: ['BTC_MODE_INFO'],
      },
    ],
  },
  { id: 'btc.contributeFromSp', group: 'btc', def: 'off', file: 'btc-payjoin.md', str: 'tx-structure', build: 'packages/btc-payjoin', dnh: DNH_BTC, values: bool(['BPJ-RCV-9']) },
  { id: 'btc.change', group: 'btc', def: 'on', file: 'metadata-hardening.md', str: 'hygiene', build: null, dnh: DNH_BTC, values: [{ v: 'on', ids: ['MH-BTC-1'], mat: 'existing' }, { v: 'off', ids: ['MH-BTC-1'] }] },
  { id: 'btc.feeRateNormalise', group: 'btc', def: 'off', file: 'metadata-hardening.md', str: 'hygiene', build: null, dnh: DNH_BTC, values: bool(['MH-BTC-2'], { w: ['roundUpCost'] }) },
  {
    id: 'btc.locktime',
    group: 'btc',
    def: 'zero',
    file: 'metadata-hardening.md',
    str: 'hygiene',
    build: null,
    dnh: DNH_BTC,
    values: [
      { v: 'zero', ids: ['MH-BTC-3'], mat: 'existing' },
      { v: 'height', ids: ['MH-BTC-3'] },
    ],
  },
  {
    id: 'btc.rbf',
    group: 'btc',
    def: 'on',
    file: 'metadata-hardening.md',
    str: 'hygiene',
    build: null,
    dnh: DNH_BTC,
    values: [
      { v: 'on', ids: ['MH-BTC-4'], mat: 'existing' },
      { v: 'off', ids: ['MH-BTC-4'] },
    ],
  },
  {
    id: 'btc.ordering',
    group: 'btc',
    def: 'caller',
    file: 'metadata-hardening.md',
    str: 'hygiene',
    build: null,
    dnh: DNH_BTC,
    values: [
      { v: 'caller', ids: ['MH-BTC-5'], mat: 'existing' },
      { v: 'bip69', ids: ['MH-BTC-5'] },
      { v: 'shuffle', ids: ['MH-BTC-5'], w: ['nonDeterministicOrdering'] },
    ],
  },
  { id: 'btc.psbtStrip', group: 'btc', def: 'off', file: 'metadata-hardening.md', str: 'hygiene', build: null, dnh: DNH_BTC, values: bool(['MH-BTC-6']) },
  // ---- 7.6 operator, deployment, build scope (not user selectable)
  opsOption('ops.walletFunding', 'relayer-operator', 'metadata-hardening.md', 'MH-WAL-2'),
  opsOption('ops.privateSubmission', 'deployment', 'metadata-hardening.md', 'MH-REL-1', ['private-submission-endpoint']),
  opsOption('ops.relayerPolicy', 'relayer-operator', 'metadata-hardening.md', 'MH-REL-2'),
  opsOption('ops.relayerResponsePadding', 'relayer-operator', 'metadata-hardening.md', 'MH-REL-5'),
  opsOption('ops.upstreamTransport', 'relayer-operator', 'network-privacy.md', 'NP-R-1'),
  opsOption('ops.rateLimitBucket', 'relayer-operator', 'security-specs/privacy-ops.md', 'PO-NET-5'),
  opsOption('ops.feeNotTracked', 'deployment', 'metadata-hardening.md', 'MH-FEE-2'),
  opsOption('ops.announceDefaults', 'deployment', 'metadata-hardening.md', 'MH-ANN-1'),
  opsOption('ops.sweepRelayerV2', 'deployment', 'hygiene.md', 'HY-CTR-1'),
  opsOption('ops.webHardening', 'build', 'metadata-hardening.md', ['MH-WEB-1', 'MH-WEB-2', 'MH-WEB-3']),
  opsOption('ops.buildNetProfile', 'build', 'network-privacy.md', 'NP-P-1'),
];

function opsOption(id: OptionId, scope: Scope, file: string, specId: string | readonly string[], trust: readonly TrustParty[] = []): OIn {
  const ids = typeof specId === 'string' ? [specId] : specId;
  return {
    id,
    group: 'operator',
    scope,
    def: 'off',
    file,
    str: 'hygiene',
    build: null,
    dnh: DNH_OPS,
    selectable: false,
    values: [
      { v: 'off', ids, mat: 'existing' },
      { v: 'on', ids, trust },
    ],
  };
}

function buildCatalogue(): Readonly<Record<OptionId, OptionDef>> {
  const out: Partial<Record<OptionId, OptionDef>> = {};
  for (const o of OPTION_INPUTS) out[o.id] = build(o);
  for (const id of OPTION_IDS) if (!out[id]) throw new Error(`catalogue missing ${id}`);
  return out as Readonly<Record<OptionId, OptionDef>>;
}

/** Every option, keyed by id. */
export const OPTION_CATALOGUE: Readonly<Record<OptionId, OptionDef>> = buildCatalogue();

/** Options grouped for display, in catalogue order. */
export const OPTION_GROUPS: readonly { readonly id: GroupId; readonly options: readonly OptionId[] }[] = (
  ['sweep', 'pay', 'invoice', 'network', 'btc', 'operator'] as const
).map((id) => ({ id, options: OPTION_IDS.filter((o) => OPTION_CATALOGUE[o].group === id) }));

/** Exit values that go through a pool. */
export const POOL_EXIT_VALUES: readonly string[] = POOL_EXITS;
/** Payer modes that call a sponsor. */
export const SPONSORED_PAYER_MODES: readonly string[] = SPONSORED;
