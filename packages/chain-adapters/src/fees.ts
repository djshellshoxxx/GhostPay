import { fail } from './errors.js';
import { MAX_UINT256, type Address } from './types.js';

/**
 * Fee constants, normative per docs/FEE_SCHEDULE.md and the compiled router
 * (`FEE_BPS = 25`, `BPS = 10_000`). The fee RECIPIENT is intentionally absent:
 * it only ever comes from a deployment manifest (ADR-0007).
 */
export const FEE_SCHEDULE = Object.freeze({
  /** Basis point denominator. */
  BPS: 10_000n,
  /** F-PAY router fee in bps of gross (floor-rounded). */
  ROUTER_FEE_BPS: 25n,
  /** F-SPONSOR: gas reimbursement multiplier numerator/denominator (110 %). */
  SPONSOR_GAS_NUM: 110n,
  SPONSOR_GAS_DEN: 100n,
  /** F-SPONSOR: minimum fee in bps of the swept amount. */
  SPONSOR_MIN_BPS: 50n,
  /** F-SPONSOR: hard cap in bps of the swept amount. */
  SPONSOR_CAP_BPS: 300n,
  /** Default safety margin for the gas buffer, in bps. */
  DEFAULT_BUFFER_SAFETY_BPS: 2_000n,
});

/** Largest `gross` the router accepts: `gross * 25` must not overflow uint256 (checked-arithmetic panic on-chain). */
export const MAX_ROUTER_GROSS: bigint = MAX_UINT256 / FEE_SCHEDULE.ROUTER_FEE_BPS;

function uint(value: bigint, what: string, max: bigint = MAX_UINT256): void {
  if (typeof value !== 'bigint' || value < 0n || value > max) fail('INVALID_INPUT', `${what} out of range`);
}

/**
 * Router fee: `floor(gross * 25 / 10_000)`. Identical to `GhostPayRouter`.
 *
 * @param gross Gross amount in base units, `0 <= gross <= MAX_ROUTER_GROSS`.
 * @returns Fee in base units (0 for `gross < 400`).
 * @throws {ChainAdapterError} `INVALID_INPUT` outside the range (the router reverts there too).
 */
export function routerFee(gross: bigint): bigint {
  uint(gross, 'gross', MAX_ROUTER_GROSS);
  return (gross * FEE_SCHEDULE.ROUTER_FEE_BPS) / FEE_SCHEDULE.BPS;
}

/**
 * Net amount delivered to the stealth address: `gross - routerFee(gross)`.
 *
 * @param gross Gross amount, `1 <= gross <= MAX_ROUTER_GROSS`.
 * @returns Net, always `>= 1`.
 * @throws {ChainAdapterError} `INVALID_INPUT` when `gross == 0` (router: `ZeroAmount`) or out of range.
 */
export function routerNet(gross: bigint): bigint {
  if (gross === 0n) fail('INVALID_INPUT', 'gross must be positive');
  return gross - routerFee(gross);
}

/** Fee/net split of one router payment. */
export interface RouterSplit {
  readonly gross: bigint;
  readonly fee: bigint;
  readonly net: bigint;
}

/**
 * Computes the full router split.
 *
 * @param gross Gross amount (see {@link routerNet}).
 * @returns `{ gross, fee, net }` with `fee + net == gross`.
 */
export function routerSplit(gross: bigint): RouterSplit {
  const net = routerNet(gross);
  return { gross, fee: gross - net, net };
}

/**
 * Smallest `gross` whose router net is at least `net` (for a "payer pays the fee" invoice).
 *
 * @remarks The result may deliver more than `net` by at most 1 base unit because the fee is floor-rounded.
 * @param net Desired net amount, `>= 1`.
 * @returns Minimal gross.
 * @throws {ChainAdapterError} `INVALID_INPUT` when `net` is not positive or the result exceeds {@link MAX_ROUTER_GROSS}.
 */
export function grossForNet(net: bigint): bigint {
  uint(net, 'net');
  if (net === 0n) fail('INVALID_INPUT', 'net must be positive');
  const denom = FEE_SCHEDULE.BPS - FEE_SCHEDULE.ROUTER_FEE_BPS;
  const estimate = (net * FEE_SCHEDULE.BPS + denom - 1n) / denom;
  // The estimate can overshoot the minimal gross by a few units; clamp it so the top of the range works.
  let g = estimate > MAX_ROUTER_GROSS ? MAX_ROUTER_GROSS : estimate;
  while (g > 1n && g - 1n - ((g - 1n) * FEE_SCHEDULE.ROUTER_FEE_BPS) / FEE_SCHEDULE.BPS >= net) g -= 1n;
  while (g <= MAX_ROUTER_GROSS && g - (g * FEE_SCHEDULE.ROUTER_FEE_BPS) / FEE_SCHEDULE.BPS < net) g += 1n;
  if (g > MAX_ROUTER_GROSS) fail('INVALID_INPUT', 'net too large');
  return g;
}

/**
 * Native gas buffer for `payERC20WithBuffer` (CONTRACTS_SPEC section 3):
 * `ceil(estimatedSweepGas * maxFeePerGas * (10_000 + safetyBps) / 10_000)`.
 *
 * @param input Gas estimate (units), max fee per gas (wei) and safety margin (bps).
 * @returns Buffer in wei, rounded up. No router fee applies to the buffer.
 * @throws {ChainAdapterError} `INVALID_INPUT` for negative values, zero gas/fee, or a result above uint256.
 */
export function calculateBuffer(input: {
  readonly estimatedSweepGas: bigint;
  readonly maxFeePerGas: bigint;
  readonly safetyBps: bigint;
}): bigint {
  uint(input.estimatedSweepGas, 'estimatedSweepGas');
  uint(input.maxFeePerGas, 'maxFeePerGas');
  uint(input.safetyBps, 'safetyBps', 100_000n);
  if (input.estimatedSweepGas === 0n || input.maxFeePerGas === 0n) fail('INVALID_INPUT', 'gas inputs must be positive');
  const base = input.estimatedSweepGas * input.maxFeePerGas;
  const out = (base * (FEE_SCHEDULE.BPS + input.safetyBps) + FEE_SCHEDULE.BPS - 1n) / FEE_SCHEDULE.BPS;
  if (out > MAX_UINT256) fail('INVALID_INPUT', 'buffer overflows uint256');
  return out;
}

/** Result of {@link sponsorFee}. */
export interface SponsorFeeQuote {
  /** Fee in token base units; `0 <= fee < amount`. */
  readonly fee: bigint;
  /** Amount that reaches the destination (`amount - fee`). */
  readonly net: bigint;
  /** True when the 300 bps cap bound the result. */
  readonly capped: boolean;
}

/**
 * F-SPONSOR fee policy: `clamp(max(gas * 110/100, amount * 50/10_000), cap = amount * 300/10_000)`.
 *
 * @remarks Rounding: the gas term and the 50 bps floor term round UP (never under-reimburse the
 * relayer by truncation); the cap rounds DOWN (the payer is never charged above 300 bps). If the cap
 * is below the other terms the cap wins. Rule: `fee < amount` always holds because
 * `cap <= 3 % of amount < amount` for `amount > 0` (contract: `amount > fee`).
 * Validation happens client-side as well: refuse relayer quotes above this value.
 *
 * @param amount Swept token amount, `>= 1`.
 * @param gasReimbursementTokenUnits Relayer gas cost expressed in token base units, `>= 0`.
 * @returns Fee quote.
 * @throws {ChainAdapterError} `INVALID_INPUT` for bad inputs or overflow.
 */
export function sponsorFee(amount: bigint, gasReimbursementTokenUnits: bigint): SponsorFeeQuote {
  uint(amount, 'amount');
  uint(gasReimbursementTokenUnits, 'gasReimbursement');
  if (amount === 0n) fail('INVALID_INPUT', 'amount must be positive');
  const gasTerm = ceilDiv(gasReimbursementTokenUnits * FEE_SCHEDULE.SPONSOR_GAS_NUM, FEE_SCHEDULE.SPONSOR_GAS_DEN);
  const minTerm = ceilDiv(amount * FEE_SCHEDULE.SPONSOR_MIN_BPS, FEE_SCHEDULE.BPS);
  const cap = (amount * FEE_SCHEDULE.SPONSOR_CAP_BPS) / FEE_SCHEDULE.BPS;
  const want = gasTerm > minTerm ? gasTerm : minTerm;
  const capped = want > cap;
  const fee = capped ? cap : want;
  return { fee, net: amount - fee, capped };
}

/**
 * Client-side check of a relayer-quoted sweep fee.
 *
 * @param amount Swept amount.
 * @param quotedFee Fee the relayer asks to be signed.
 * @returns void when acceptable.
 * @throws {ChainAdapterError} `FEE_REJECTED` when `quotedFee >= amount` or above the 300 bps cap.
 */
export function assertSponsorFeeAcceptable(amount: bigint, quotedFee: bigint): void {
  uint(amount, 'amount');
  uint(quotedFee, 'quotedFee');
  if (quotedFee >= amount) fail('FEE_REJECTED', 'fee must be below amount');
  if (quotedFee > (amount * FEE_SCHEDULE.SPONSOR_CAP_BPS) / FEE_SCHEDULE.BPS) fail('FEE_REJECTED', 'fee above published cap');
}

/**
 * Flat F-SECURE fee configuration (PolicyAccountFactory, built later). Pure data: the amount is
 * immutable per factory deployment and comes from a manifest, never from source.
 */
export interface FlatSecurityFeeConfig {
  /** Stablecoin the fee is paid in. */
  readonly feeToken: Address;
  /** Fee in `feeToken` base units. */
  readonly amount: bigint;
  /** Intended USD value as a decimal string, for display only (default "3.00", OWNER decision). */
  readonly usdTarget: string;
}

/**
 * Validates a {@link FlatSecurityFeeConfig}.
 *
 * @param cfg Candidate config.
 * @returns The same object when valid.
 * @throws {ChainAdapterError} `INVALID_INPUT` for a non-positive amount, bad token or bad usd string.
 */
export function validateFlatSecurityFee(cfg: FlatSecurityFeeConfig): FlatSecurityFeeConfig {
  if (!/^0x[0-9a-fA-F]{40}$/.test(cfg.feeToken) || /^0x0{40}$/.test(cfg.feeToken)) fail('INVALID_INPUT', 'feeToken');
  uint(cfg.amount, 'flat fee');
  if (cfg.amount === 0n) fail('INVALID_INPUT', 'flat fee must be positive');
  if (!/^\d{1,6}\.\d{2}$/.test(cfg.usdTarget)) fail('INVALID_INPUT', 'usdTarget');
  return cfg;
}

/** @internal Ceiling division for non-negative operands. */
export function ceilDiv(a: bigint, b: bigint): bigint {
  return (a + b - 1n) / b;
}
