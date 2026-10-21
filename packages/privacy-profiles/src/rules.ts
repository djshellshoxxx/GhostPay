/**
 * Conflict, dependency, warning and moot rules as data (the predicate DSL lives in `types.ts`).
 * Rules marked `'new'` are not stated by any method spec; they are listed in DEVIATIONS.md for owner review.
 * @security Conflicts default to blocking when no spec covers a combination.
 */
import { POOL_EXIT_VALUES, SPONSORED_PAYER_MODES } from './catalogue.js';
import type { ErrorKey, OptionId, Pred, RuleDef, SpecRef, WarningKey } from './types.js';

const is = (opt: OptionId, ...v: string[]): Pred => ({ opt, in: v });
const isNot = (opt: OptionId, ...v: string[]): Pred => ({ opt, notIn: v });
const POOL = [...POOL_EXIT_VALUES];
const SPONSORED = [...SPONSORED_PAYER_MODES];
const NET_TOR = ['tor-browser', 'tor-socks', 'onion'];
const ref = (file: string, ...ids: string[]): SpecRef => ({ file, ids });
const err = (n: string): ErrorKey => `privacy.err.${n}`;
const warn = (n: string): WarningKey => `privacy.warn.${n}`;

/** All rules, in id order. */
export const RULES: readonly RuleDef[] = [
  { id: 'R-01', kind: 'conflict', when: { scan: 'chain' }, code: 'E_WRONG_CHAIN', key: err('wrongChain'), specRef: ref('payer-hiding.md', 'PH-GEN-1') },
  { id: 'R-02', kind: 'conflict', when: { scan: 'maturity-unavailable' }, code: 'E_MATURITY', key: err('notAvailable'), specRef: ref('external-pools.md', 'EP-3', 'EP-4') },
  { id: 'R-03', kind: 'conflict', when: { scan: 'maturity-test-only' }, code: 'E_CAPABILITY', key: err('testModeOnly'), specRef: ref('external-pools.md', 'EP-M') },
  { id: 'R-04', kind: 'requires', when: isNot('sweep.hops', '0'), then: { ack: 'privacy.ack.hopsWeak' }, code: 'E_ACK_MISSING', key: err('ackMissing.hopsWeak'), specRef: ref('hops.md', 'HOP-REQ-1') },
  { id: 'R-05', kind: 'conflict', when: { all: [is('sweep.hopRelayers', 'direct'), isNot('sweep.hops', '0', '1')] }, key: err('conflict.hopsDirectMulti'), specRef: ref('hops.md', 'HOP-REQ-12') },
  { id: 'R-06', kind: 'requires', when: { all: [isNot('sweep.hops', '0'), isNot('sweep.hopRelayers', 'direct')] }, then: { cap: 'sweep-relayer' }, code: 'E_CAPABILITY', key: err('requires.sweepRelayer'), specRef: ref('hops.md', 'HOP-RLY-1') },
  { id: 'R-07', kind: 'conflict', when: { all: [isNot('sweep.hops', '0'), { assetNot: ['erc20-permit'] }] }, code: 'E_WRONG_ASSET', key: err('hopsNoPermit'), specRef: ref('hops.md', 'HOP-RLY-1') },
  { id: 'R-08', kind: 'warn', when: { all: [isNot('sweep.hops', '0'), is('sweep.exit', ...POOL)] }, code: 'W_MOOT', key: warn('hopsBeforePoolNoGain'), specRef: ref('hops.md', 'HOP-POOL-1') },
  { id: 'R-09', kind: 'conflict', when: { all: [is('sweep.hops', '3', '4'), is('sweep.exit', ...POOL)] }, key: err('conflict.hopsPoolMax2'), specRef: ref('hops.md', 'HOP-POOL-1') },
  { id: 'R-10', kind: 'conflict', when: { all: [is('sweep.exit', ...POOL), is('sweep.destination', 'external-reuse')] }, key: err('conflict.poolReuseDestination'), specRef: ref('shielded-pool.md', 'SP-SDK-7') },
  { id: 'R-11', kind: 'conflict', when: { all: [{ asset: ['confidential'] }, { any: [isNot('sweep.exit', 'plain'), isNot('sweep.hops', '0')] }] }, key: err('conflict.ctNoPoolOrHops'), specRef: ref('confidential-tokens.md', 'CT-1') },
  { id: 'R-12', kind: 'conflict', when: { all: [isNot('pay.amountVisibility', 'public'), isNot('pay.payerMode', 'direct')] }, key: err('conflict.ctPayerMode'), specRef: 'new' },
  { id: 'R-13', kind: 'conflict', when: { all: [isNot('pay.amountVisibility', 'public'), is('pay.source', 'shielded-pool')] }, key: err('conflict.ctPoolPay'), specRef: 'new' },
  { id: 'R-14', kind: 'conflict', when: { all: [isNot('pay.amountVisibility', 'public'), is('pay.amountBlur', 'split', 'denom')] }, key: err('conflict.ctSplit'), specRef: 'new' },
  { id: 'R-15', kind: 'moot', when: { all: [isNot('pay.amountVisibility', 'public'), { any: [is('pay.amountBlur', 'round'), is('pay.amountNoise', 'on')] }] }, key: warn('mootCombination'), specRef: 'new' },
  { id: 'R-16', kind: 'conflict', when: { all: [isNot('pay.amountVisibility', 'public'), is('pay.route', 'direct-no-fee')] }, key: err('conflict.ctDirectPay'), specRef: ref('confidential-tokens.md', 'CT-PAY-1') },
  { id: 'R-17', kind: 'conflict', when: { all: [is('pay.source', 'shielded-pool'), isNot('pay.payerMode', 'direct')] }, key: err('conflict.poolPayPayerMode'), specRef: ref('shielded-pool.md', 'SP-PAY') },
  { id: 'R-18', kind: 'conflict', when: { all: [is('pay.source', 'shielded-pool'), is('pay.amountBlur', 'round', 'split', 'denom')] }, key: err('conflict.poolPayBlur'), specRef: 'new' },
  { id: 'R-19', kind: 'moot', when: { all: [is('pay.source', 'shielded-pool'), is('pay.route', 'direct-no-fee')] }, key: warn('mootCombination'), specRef: ref('shielded-pool.md', 'SP-PAY') },
  { id: 'R-20', kind: 'conflict', when: { all: [is('pay.route', 'direct-no-fee'), is('pay.payerMode', ...SPONSORED)] }, key: err('conflict.directPaySponsored'), specRef: ref('metadata-hardening.md', 'MH-FEE-1') },
  { id: 'R-21', kind: 'requires', when: is('pay.route', 'direct-no-fee'), then: is('announce.metadata', 'minimal'), key: err('requires.annMinimal'), specRef: ref('metadata-hardening.md', 'MH-FEE-1', 'MH-ANN-3') },
  { id: 'R-22', kind: 'conflict', when: { all: [is('pay.amountNoise', 'on'), is('pay.amountBlur', 'round')] }, key: err('conflict.amountNoiseRound'), specRef: 'new' },
  { id: 'R-23', kind: 'requires', when: is('invoice.padding', 'on'), then: is('invoice.encrypt', 'on'), key: err('requires.encrypt'), specRef: ref('metadata-hardening.md', 'MH-INV-1', 'MH-INV-2') },
  { id: 'R-24', kind: 'warn', when: is('identity.perInvoiceMeta', 'on'), key: warn('perInvoiceSignerUnpinned'), specRef: ref('metadata-hardening.md', 'MH-ID-1') },
  { id: 'R-25', kind: 'warn', when: is('announce.viewTag', 'mask'), key: warn('tagMaskInterop'), specRef: ref('metadata-hardening.md', 'MH-TAG-2') },
  {
    id: 'R-26',
    kind: 'requires',
    when: { any: [is('relayer.multi', 'on'), is('net.endpointSeparation', 'on'), is('net.rpcMode', 'quorum')] },
    then: {
      all: [
        { any: [is('relayer.multi', 'off'), { cap: 'multi-relayer' }] },
        { any: [{ all: [is('net.endpointSeparation', 'off'), isNot('net.rpcMode', 'quorum')] }, { cap: 'multi-rpc' }] },
      ],
    },
    code: 'E_CAPABILITY',
    key: err('requires.multiEndpoint'),
    specRef: ref('metadata-hardening.md', 'MH-REL-4', 'MH-NET-1'),
  },
  { id: 'R-27', kind: 'warn', when: is('relayer.multi', 'on'), key: warn('quoteSweepSameRelayer'), specRef: ref('metadata-hardening.md', 'MH-REL-4') },
  { id: 'R-28', kind: 'conflict', when: { scan: 'env' }, code: 'E_WRONG_ENV', key: err('wrongEnv'), specRef: ref('network-privacy.md', 'NP-P-1') },
  { id: 'R-29', kind: 'conflict', when: { scan: 'selftest' }, code: 'E_SELFTEST', key: err('selfTestFailed'), specRef: ref('network-privacy.md', 'NP-T-5') },
  { id: 'R-30', kind: 'requires', when: is('net.scanMode', 'indexer-tor'), then: is('net.rpcProfile', ...NET_TOR), key: err('requires.torForIndexer'), specRef: ref('network-privacy.md', 'NP-S-1') },
  { id: 'R-31', kind: 'warn', when: { scan: 'relay-direct' }, key: warn('networkDirectToParty'), specRef: ref('security-specs/privacy-ops.md', 'PO-NET-1') },
  { id: 'R-32', kind: 'warn', when: { all: [is('pay.amountBlur', 'split', 'denom'), is('pay.payerMode', ...SPONSORED)] }, key: warn('sponsorSeesAllParts'), specRef: 'new' },
  { id: 'R-33', kind: 'warn', when: { all: [is('sweep.exit', ...POOL), is('sweep.exitGas', 'topup'), is('sweep.knownWalletGuard', 'on')] }, key: warn('guardBlocksTopup'), specRef: ref('hygiene.md', 'HY-FUND') },
  { id: 'R-34', kind: 'conflict', when: { all: [is('sweep.exit', 'privacy-pools'), is('sweep.exitGas', 'permit-sponsored')] }, key: err('conflict.ppDepositorMustBeS1'), specRef: ref('external-pools.md', 'EP-PP-1') },
  {
    id: 'R-35',
    kind: 'requires',
    when: { any: [is('sweep.poolAsp', 'publisher'), is('sweep.poolAmountPlan', 'whole')] },
    then: { all: [{ any: [is('sweep.poolAsp', 'none'), is('sweep.exit', 'shielded-pool')] }, { any: [is('sweep.poolAmountPlan', 'denominations'), is('sweep.exit', ...POOL)] }] },
    key: err('requires.poolExit'),
    specRef: ref('shielded-pool.md', 'SP-ASP', 'SP-SDK-8'),
  },
  { id: 'R-36', kind: 'conflict', when: { all: [is('btc.mode', 'payjoin-v1', 'payjoin-v2'), is('btc.locktime', 'height')] }, key: err('conflict.locktimePayjoin'), specRef: ref('metadata-hardening.md', 'MH-BTC-3') },
  { id: 'R-37', kind: 'requires', when: is('btc.contributeFromSp', 'on'), then: is('btc.mode', 'payjoin-v1', 'payjoin-v2'), key: err('requires.payjoin'), specRef: ref('btc-payjoin.md', 'BPJ-RCV-9') },
  { id: 'R-38', kind: 'warn', when: is('btc.ordering', 'shuffle'), key: warn('nonDeterministicOrdering'), specRef: ref('metadata-hardening.md', 'MH-BTC-5') },
  { id: 'R-39', kind: 'requires', when: is('pay.amountVisibility', 'ct1-zama'), then: { cap: 'seller-accepts-ct' }, code: 'E_CAPABILITY', key: err('requires.sellerCt'), specRef: ref('confidential-tokens.md', 'CT-1') },
  { id: 'R-40', kind: 'warn', when: { scan: 'maturity-experimental' }, key: warn('experimental'), specRef: ref('network-privacy.md', 'NP-N-1') },
  { id: 'R-41', kind: 'requires', when: { any: [isNot('sweep.exitGas', 'buffer'), is('sweep.poolSubmit', 'self')] }, then: is('sweep.exit', ...POOL), key: err('requires.poolExit'), specRef: 'new' },
  { id: 'R-42', kind: 'requires', when: { all: [is('sweep.exit', 'privacy-pools'), is('sweep.poolSubmit', 'relayer')] }, then: { cap: 'pp-relayer' }, code: 'E_CAPABILITY', key: err('requires.cap.pp-relayer'), specRef: ref('external-pools.md', 'EP-PP-1') },
  { id: 'R-43', kind: 'requires', when: { all: [is('sweep.exit', 'railgun'), is('sweep.poolSubmit', 'relayer')] }, then: { cap: 'railgun-broadcaster' }, code: 'E_CAPABILITY', key: err('requires.cap.railgun-broadcaster'), specRef: ref('external-pools.md', 'EP-RG-1') },
  { id: 'R-44', kind: 'requires', when: { all: [is('sweep.exit', 'shielded-pool'), is('sweep.poolSubmit', 'relayer')] }, then: { cap: 'pool-relayer' }, code: 'E_CAPABILITY', key: err('requires.cap.pool-relayer'), specRef: ref('shielded-pool.md', 'SP-REL') },
  { id: 'R-45', kind: 'requires', when: { all: [{ env: ['node'] }, { any: [is('net.rpcProfile', 'onion'), is('net.relayerProfile', 'onion')] }] }, then: { cap: 'tor-socks' }, code: 'E_CAPABILITY', key: err('requires.cap.tor-socks'), specRef: ref('network-privacy.md', 'NP-O-1') },
  { id: 'R-46', kind: 'warn', when: { all: [isNot('sweep.hops', '0'), is('sweep.hopRelayers', 'rotate'), { notCap: 'multi-relayer' }] }, key: warn('singleRelayerSeesAllHops'), specRef: ref('hops.md', 'HOP-RLY-1') },
];
