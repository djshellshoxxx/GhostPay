export { PayerSponsorError, ensure } from './errors.js';
export type { PayerSponsorErrorCode } from './errors.js';
export { TESTNET_CHAIN_IDS, assertTestnet, isTestnetChainId } from './chainGuard.js';
export type { TestnetChainId } from './chainGuard.js';
export {
  PAYER_MODES,
  PAYER_MODE_IDS,
  PAYER_MODE_INFO,
  PAYER_PUBLIC_LINE,
  TOKEN_FUNDING_LINE,
  SPONSOR_TRUST_LINE,
  modeNotices,
  modeAvailability,
  parsePayerMode,
} from './modes.js';
export type { PayerMode, PayerModeInfo, SponsorSees, HidesFromObservers, ChainCapabilities, ModeAvailability } from './modes.js';
export { parseManifest, deploymentFor } from './manifest.js';
export type { PayerHidingDeployment, PayerHidingManifest } from './manifest.js';
export {
  ROUTER_FEE_BPS,
  SELECTOR_PLAIN,
  SELECTOR_POLICY,
  routerFee,
  buildErc20Metadata,
  encodeRouterPay,
  decodeRouterPay,
  decodeAndCheckPayload,
  parseAddress,
} from './routerTargets.js';
export type { PolicyRef, RouterTarget, PayArgs, DecodedRouterPay, SignedPayFields } from './routerTargets.js';
export { roundUpSigFigs, ceilDiv } from './util.js';

export { derivePayerKey, withPayerKey } from './freshWallet/derive.js';
export type { DerivedPayer } from './freshWallet/derive.js';
export { planFunding, DEFAULT_MIN_DELAY_MS, TOKEN_FUNDING_WARNING } from './freshWallet/fundingPlan.js';
export type { FundingPlanInput, FundingPlan } from './freshWallet/fundingPlan.js';
export { lintFunding } from './freshWallet/lint.js';
export type { LintOptions } from './freshWallet/lint.js';
export { fetchFundingHistory } from './freshWallet/hygiene.js';
export type { FundingHistorySource } from './freshWallet/hygiene.js';
export type { FundingTx, FundingStep, FundingWarning, FundingWarningCode } from './freshWallet/types.js';

export {
  RELAY_TYPES,
  NO_PERMIT,
  relayDomain,
  buildRelayIntent,
  relayDigest,
  encodeRelayPay,
  buildPermitTypedData,
  toRelayPermit,
  randomNonce,
} from './relay/intent.js';
export type { RelayPayIntent, RelayPermit, BuildRelayIntentArgs, RelayTypedData } from './relay/intent.js';

export {
  EIP7702_CONSTANTS,
  DELEGATE_TYPES,
  delegateDomain,
  buildDelegatePayIntent,
  delegateDigest,
  buildClearingAuthorization,
  assertDelegateInManifest,
  isDelegatedTo,
  encodeDelegatePay,
} from './eip7702/intent.js';
export type { DelegatePayIntent, AuthorizationRequest, BuildDelegatePayIntentArgs, DelegateTypedData } from './eip7702/intent.js';

export {
  packUint128Pair,
  unpackUint128Pair,
  encodeExecuteBatch,
  decodeExecuteBatch,
  buildPayerCalls,
  assertPayerCalls,
  packedUserOpHash,
  getUserOpHashV07,
  buildUserOperation,
  encodeHandleOps,
  encodeGetNonce,
} from './erc4337/userop.js';
export type { PackedUserOperation, AccountCall, UserOpGas, PayerCallsArgs, BuildUserOperationArgs } from './erc4337/userop.js';
export {
  PAYMASTER_AND_DATA_LENGTH,
  DUMMY_PAYMASTER_SIGNATURE,
  encodePaymasterAndData,
  decodePaymasterAndData,
  paymasterSignedHash,
  withPaymasterSignature,
} from './erc4337/paymaster.js';
export type { PaymasterParams } from './erc4337/paymaster.js';
export {
  ENTRY_POINT_V07,
  ENTRY_POINT_V08,
  buildInitCode,
  encodeFactoryGetAddress,
  computeAccountAddress,
  verifyEntryPoint,
} from './erc4337/account.js';

export { SponsorService, DEFAULT_GAS_UNITS } from './sponsor/service.js';
export type { SponsorServiceOptions } from './sponsor/service.js';
export { createLogger, latencyBucket } from './sponsor/log.js';
export type { SponsorLogEntry, LatencyBucket, LogSink } from './sponsor/log.js';
export { createViemSponsorChain, isRevert } from './sponsor/viemChain.js';
export type { PublicClientLike, WalletClientLike } from './sponsor/viemChain.js';
export { paymasterSignerFromBox, assertKeyNotFundedOnMainnet, KNOWN_MAINNET_CHAIN_IDS } from './sponsor/keys.js';
export { createHttpHandler, startHttpServer } from './sponsor/http.js';
export type { HttpRequestLike, HttpResponseLike, HttpHandlerOptions } from './sponsor/http.js';
export type * from './sponsor/types.js';
