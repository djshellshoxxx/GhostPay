/**
 * Complete lists of warning, acknowledgement and error keys. Copy text lives in the apps, keyed by these.
 */
import { RULES } from './rules.js';
import type { AckKey, Capability, ErrorKey, WarningKey } from './types.js';

const wk = (n: string): WarningKey => `privacy.warn.${n}`;
const ak = (n: string): AckKey => `privacy.ack.${n}`;
const ek = (n: string): ErrorKey => `privacy.err.${n}`;

/** Warning keys. */
export const WARNING_KEYS: readonly WarningKey[] = [
  'testnetOnly', 'noAnonymity', 'payerStillPublic', 'sponsorSees', 'sponsorSeesAllParts', 'tokenFundingLink',
  'gasFundingLink', 'persistent7702Delegate', 'crowdTiny', 'depositPublic', 'aspChoiceDisclosed', 'ragequitRelinks',
  'amountTimingMatch', 'thirdPartyUnaudited', 'ownContractsUnaudited', 'insecureCeremony', 'mockNoPrivacy', 'hopsWeak',
  'singleRelayerSeesAllHops', 'hopsBeforePoolNoGain', 'fanOutLinkable', 'roundUpCost', 'tabMustStayOpen',
  'timingNotHidden', 'wrapUnwrapPublic', 'fheOperatorTrust', 'teeTrust', 'decryptRelayerSees', 'zeroTransferAmbiguity',
  'directReadsRevealAddress', 'bufferFingerprint', 'destinationReuse', 'externalDestinationUnverified',
  'knownWalletGuardOff', 'guardBlocksTopup', 'directNoFeeScanner', 'perInvoiceSignerUnpinned', 'tagMaskInterop',
  'schemeIdFingerprint', 'quoteSweepSameRelayer', 'networkDirectToParty', 'contentNotHidden', 'walletRpcOutsideApp',
  'torExitSeesHost', 'outproxySeesDestination', 'nymDestinationGroups', 'ohttpNonCollusion', 'pirNonCollusion',
  'lightClientIntegrityOnly', 'payjoinNoSilentPayment', 'payjoinFallbackBroadcast', 'payjoinUtxoProbing',
  'payjoinDirectorySees', 'nonDeterministicOrdering', 'experimental', 'mootCombination',
].map(wk);

/** Acknowledgement keys. */
export const ACK_KEYS: readonly AckKey[] = [
  'hopsWeak', 'poolDisclosure', 'shieldedPoolTestnet', 'destinationReuse', 'payerStillPublic', 'ctTrust', 'ctUnwrapPublic',
].map(ak);

/** Chain (pipeline) error keys. */
export const CHAIN_ERROR_KEYS: readonly ErrorKey[] = [
  'afterPoolExit', 'typeMismatch', 'repool', 'consolidation', 'crossChain', 'layerChanged', 'ctToPool', 'payjoinSp',
  'wrapEqualsGross',
].map((n) => ek(`chain.${n}`));

/** Chain (pipeline) warning keys. */
export const CHAIN_WARNING_KEYS: readonly WarningKey[] = [
  'creditZero', 'secondPoolNoGain', 'amountContinuity', 'longRun', 'combinationFingerprint', 'appMustStayOpen',
].map((n) => wk(`chain.${n}`));

/** Capabilities, for the per-capability `requires.cap.*` error keys. */
export const ALL_CAPABILITIES: readonly Capability[] = [
  'sweep-relayer', 'multi-relayer', 'payer-sponsor', 'eip7702', 'erc4337-entrypoint', 'erc4337-paymaster',
  'manifest:shielded-pool', 'pool-relayer', 'pool-note', 'asp-publisher', 'manifest:privacy-pools', 'pp-relayer',
  'manifest:railgun', 'railgun-broadcaster', 'manifest:confidential-ct1', 'manifest:confidential-ct2',
  'manifest:confidential-ct3', 'seller-accepts-ct', 'tor-browser-asserted', 'tor-socks', 'onion-origin', 'onion-rpc',
  'onion-relayer', 'i2p-proxy', 'nym-build', 'nym-socks5', 'ohttp-gateway-rpc', 'ohttp-gateway-relayer', 'multi-rpc',
  'own-node', 'light-client', 'tor-indexer', 'pir-servers', 'payjoin-directory', 'payjoin-ffi', 'payjoin-v1-endpoint',
  'selftest-ok:rpc', 'selftest-ok:relayer', 'test-mode',
];

/** Error keys that the engine emits without a rule row. */
export const IMPLICIT_ERROR_KEYS: readonly ErrorKey[] = [
  'privacy.err.notSelectable',
  'privacy.err.unknownValue',
  'privacy.err.wrongAsset',
  ...ACK_KEYS.map((k) => `privacy.err.ackMissing.${k.slice('privacy.ack.'.length)}` as ErrorKey),
  ...ALL_CAPABILITIES.map((c) => `privacy.err.requires.cap.${c}` as ErrorKey),
];

/** Error keys. */
export const ERROR_KEYS: readonly ErrorKey[] = [
  ...new Set<ErrorKey>([
    ...RULES.map((r) => r.key).filter((k): k is ErrorKey => k.startsWith('privacy.err.')),
    ...CHAIN_ERROR_KEYS,
    ...IMPLICIT_ERROR_KEYS,
  ]),
].sort();
