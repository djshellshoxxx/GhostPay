export { DonationError } from './errors.js';
export type { DonationErrorCode } from './errors.js';
export {
  DEFAULT_DONATION_PPM,
  MAX_DONATION_PPM,
  PPM_DENOMINATOR,
  DONATION_DUST_FLOOR,
  validatePpm,
  parsePercentInput,
  formatPercent,
} from './rate.js';
export type { RateReason, RateResult } from './rate.js';
export { computeDonation, defaultMinUnits } from './amount.js';
export type { ComputeInput, DonationAmount } from './amount.js';
export { DEFAULT_SETTINGS, resolveDonation, isUsableRecipient } from './recipient.js';
export type { DonationSettings, DonationConfig, ResolvedDonation } from './recipient.js';
export { DONATION_TEXT_KEYS, buildDonationLines } from './view.js';
export type { DonationPlan, DonationLine } from './view.js';
export { ERC20_TRANSFER_ABI, buildDonationCall, buildSendCallsBatch, supportsSendCalls } from './calls.js';
export type {
  Call,
  DonationCallInput,
  DonationCallResult,
  CallRefusal,
  SendCallsEntry,
  SendCallsParams,
} from './calls.js';
export { donationKey, beginAttempt, canSendDonation, reduceAttempt } from './attempt.js';
export type { DonationAttempt, DonationStatus, DonationEvent } from './attempt.js';
