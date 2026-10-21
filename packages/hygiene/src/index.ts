export { HygieneError, type HygieneErrorCode } from './errors.js';
export { ALLOWED_CHAIN_IDS, assertTestnetChain } from './testnet.js';
export type { Address, Hex } from './addr.js';
export {
  deriveFreshDestination,
  recoverDestinationKey,
  hkdfRng,
  type FreshDestination,
} from './destination.js';
export { DestLedger, type LedgerRow, type CanUse } from './ledger.js';
export { assertNoConsolidation, sameBlockGate } from './consolidation.js';
export {
  TRANSFER_TOPIC,
  DEFAULT_DECOYS,
  DEFAULT_SPENT_CAP,
  parseTransferLogs,
  assertAddressFree,
  addressFreeReceipt,
  sweepConfirmed,
  spentCheck,
  pickDecoys,
  batchedRead,
  type TransferLog,
  type VerifyRpc,
  type BatchRpc,
  type SpentCheck,
  type ReadCall,
} from './verify.js';
export {
  roundBuffer,
  planBuffer,
  bufferDust,
  dustWorthSweeping,
  type BufferRounding,
  type BufferPlan,
} from './buffer.js';
export { fundingGuard, FUNDING_GUARD_MESSAGE } from './guard.js';
export {
  DEFAULT_HYGIENE_SETTINGS,
  sanitizeHygieneSettings,
  HYGIENE_LABELS,
  HYGIENE_NOT_PROTECTED,
  type HygieneSettings,
} from './options.js';
export { type HopAddressSource, createHopAddressSource } from './hop-source.js';
