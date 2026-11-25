/**
 * P13 exact amount handling: canonical decimal strings, display conversion, the euint64 domain, ERC-7984 wrapper
 * units and the confidential router's fee split. bigint only; no floating point anywhere.
 * These are plaintext previews and validators. They prove nothing on-chain: conservation on-chain is enforced (or not)
 * by the selected protocol's contracts, never by this code.
 */
import { FEE_DIVISOR, UINT64_MAX } from '../../abi.js';
import { check, fail } from './errors.js';

/** COMMON `DecimalUnits`: unsigned canonical decimal integer string, no sign, exponent or leading zero. */
export type DecimalUnits = string;

/** Largest uint256. */
export const MAX_UINT256 = (1n << 256n) - 1n;
/** Largest asset `decimals` accepted (display metadata only). */
export const MAX_DECIMALS = 36;
/** Longest display-amount text accepted before parsing. */
export const MAX_DISPLAY_LENGTH = 100;
/** Most values in one conservation check (COMMON batch budget). */
export const MAX_TERMS = 1000;

const DEC_RE = /^(?:0|[1-9][0-9]{0,77})$/;
const DISPLAY_RE = /^(0|[1-9][0-9]*)(?:\.([0-9]+))?$/;

/** Inclusive amount range. */
export interface AmountDomain {
  readonly min: bigint;
  readonly max: bigint;
}

/** `euint64` amounts carried by CT-1 (ERC-7984): 1 to 2^64-1. Zero is refused (it is the silent-failure value). */
export const EUINT64_DOMAIN: AmountDomain = Object.freeze({ min: 1n, max: UINT64_MAX });

function assertBigint(v: unknown): asserts v is bigint {
  check(typeof v === 'bigint', 'P13_INVALID_AMOUNT', 'amount must be a bigint');
}

/**
 * Parses COMMON `DecimalUnits`.
 * @throws {P13Error} `P13_INVALID_AMOUNT` for anything but a canonical decimal string; `P13_AMOUNT_RANGE` above 2^256-1.
 */
export function parseDecimalUnits(text: unknown): bigint {
  check(typeof text === 'string' && DEC_RE.test(text), 'P13_INVALID_AMOUNT', 'amount must be a canonical decimal string');
  const v = BigInt(text);
  check(v <= MAX_UINT256, 'P13_AMOUNT_RANGE', 'amount exceeds uint256');
  return v;
}

/** Formats a value as COMMON `DecimalUnits` (0 to 2^256-1). */
export function formatDecimalUnits(v: bigint): DecimalUnits {
  assertBigint(v);
  check(v >= 0n && v <= MAX_UINT256, 'P13_AMOUNT_RANGE', 'amount outside 0..2^256-1');
  return v.toString(10);
}

function assertDecimals(decimals: number): void {
  check(Number.isInteger(decimals) && decimals >= 0 && decimals <= MAX_DECIMALS, 'P13_INVALID_ASSET', 'invalid decimals');
}

/**
 * Converts user-typed decimal text (`"12.345"`) to base units exactly.
 * @param decimals Asset decimals, 0..36.
 * @throws {P13Error} `P13_PRECISION` when the text has more fraction digits than `decimals` (no silent rounding).
 */
export function parseDisplayAmount(text: unknown, decimals: number): bigint {
  assertDecimals(decimals);
  check(typeof text === 'string' && text.length <= MAX_DISPLAY_LENGTH, 'P13_INVALID_AMOUNT', 'invalid amount text');
  const m = DISPLAY_RE.exec(text);
  check(m !== null, 'P13_INVALID_AMOUNT', 'invalid amount text');
  const whole = m[1] ?? '0';
  const frac = m[2] ?? '';
  check(frac.length <= decimals, 'P13_PRECISION', 'more fraction digits than the asset supports');
  const v = BigInt(whole + frac.padEnd(decimals, '0'));
  check(v <= MAX_UINT256, 'P13_AMOUNT_RANGE', 'amount exceeds uint256');
  return v;
}

/** Formats base units as exact decimal text; trailing fraction zeros are dropped. */
export function formatDisplayAmount(units: bigint, decimals: number): string {
  assertDecimals(decimals);
  const digits = formatDecimalUnits(units);
  if (decimals === 0) return digits;
  const padded = digits.padStart(decimals + 1, '0');
  const whole = padded.slice(0, padded.length - decimals);
  const frac = padded.slice(padded.length - decimals).replace(/0+$/, '');
  return frac.length === 0 ? whole : `${whole}.${frac}`;
}

/**
 * Asserts `v` lies in `domain`.
 * @throws {P13Error} `P13_INVALID_AMOUNT` for a non-bigint, `P13_AMOUNT_RANGE` outside the domain.
 */
export function assertInDomain(v: bigint, domain: AmountDomain): bigint {
  assertBigint(v);
  check(v >= domain.min && v <= domain.max, 'P13_AMOUNT_RANGE', 'amount outside the supported range');
  return v;
}

/** `a + b` with both operands and the result in `0..max`. */
export function checkedAdd(a: bigint, b: bigint, max: bigint = UINT64_MAX): bigint {
  assertBigint(a);
  assertBigint(b);
  check(a >= 0n && b >= 0n && a <= max && b <= max, 'P13_AMOUNT_RANGE', 'operand outside range');
  const s = a + b;
  check(s <= max, 'P13_OVERFLOW', 'sum overflows');
  return s;
}

/** `a - b`, refusing a negative result. */
export function checkedSub(a: bigint, b: bigint): bigint {
  assertBigint(a);
  assertBigint(b);
  check(a >= 0n && b >= 0n, 'P13_AMOUNT_RANGE', 'operand outside range');
  check(b <= a, 'P13_OVERFLOW', 'difference underflows');
  return a - b;
}

/** Confidential-token decimals and the underlying-per-confidential rate. */
export interface WrapperUnits {
  readonly decimals: number;
  readonly rate: bigint;
}

/** Largest confidential decimals: OpenZeppelin `ERC7984ERC20Wrapper._maxDecimals()` (0.5.3) returns 6. */
export const WRAPPER_MAX_DECIMALS = 6;

/**
 * Mirrors the OpenZeppelin Confidential Contracts 0.5.3 `ERC7984ERC20Wrapper` constructor: decimals = min(d, 6) and
 * rate = 10^(d-6) when d > 6, else 1. Read from `token/ERC7984/extensions/ERC7984ERC20Wrapper.sol` [R].
 */
export function wrapperUnits(underlyingDecimals: number): WrapperUnits {
  assertDecimals(underlyingDecimals);
  if (underlyingDecimals > WRAPPER_MAX_DECIMALS) {
    return { decimals: WRAPPER_MAX_DECIMALS, rate: 10n ** BigInt(underlyingDecimals - WRAPPER_MAX_DECIMALS) };
  }
  return { decimals: underlyingDecimals, rate: 1n };
}

function assertRate(rate: bigint): void {
  check(typeof rate === 'bigint' && rate >= 1n && rate <= MAX_UINT256, 'P13_INVALID_ASSET', 'invalid wrapper rate');
}

/**
 * Underlying ERC-20 units to confidential units. The wrapper itself silently keeps the remainder of
 * `amount % rate` with the payer; GhostPay refuses such amounts instead.
 * @throws {P13Error} `P13_PRECISION` unless `underlying` is a multiple of `rate`; `P13_AMOUNT_RANGE` outside euint64.
 */
export function toConfidentialUnits(underlying: bigint, rate: bigint): bigint {
  assertRate(rate);
  assertBigint(underlying);
  check(underlying >= 0n && underlying <= MAX_UINT256, 'P13_AMOUNT_RANGE', 'amount outside range');
  check(underlying % rate === 0n, 'P13_PRECISION', 'amount not representable in the confidential token');
  return assertInDomain(underlying / rate, EUINT64_DOMAIN);
}

/** Confidential units to underlying units (what an unwrap pays out). */
export function toUnderlyingUnits(confidential: bigint, rate: bigint): bigint {
  assertRate(rate);
  assertInDomain(confidential, EUINT64_DOMAIN);
  const v = confidential * rate;
  check(v <= MAX_UINT256, 'P13_OVERFLOW', 'amount exceeds uint256');
  return v;
}

/** Fee/net split of one confidential router payment. */
export interface RouterSplit {
  readonly gross: bigint;
  readonly fee: bigint;
  readonly net: bigint;
}

/**
 * Preview of `GhostPayConfidentialRouter.payConfidential`: fee = floor(gross / 400), net = gross - fee
 * (the same rule `CleartextLedger` executes). P13 adds no fee of its own.
 */
export function confidentialRouterSplit(gross: bigint): RouterSplit {
  assertInDomain(gross, EUINT64_DOMAIN);
  const fee = gross / FEE_DIVISOR;
  return { gross, fee, net: gross - fee };
}

/**
 * Smallest gross whose router net is at least `net` (payer pays the fee).
 * @throws {P13Error} `P13_AMOUNT_RANGE` if that gross exceeds 2^64-1.
 */
export function confidentialGrossForNet(net: bigint): bigint {
  assertInDomain(net, EUINT64_DOMAIN);
  // net(g) = g - floor(g/400) is non-decreasing; start at the real-valued inverse and correct by at most a few steps.
  let g = (net * FEE_DIVISOR + (FEE_DIVISOR - 2n)) / (FEE_DIVISOR - 1n);
  const netOf = (x: bigint): bigint => x - x / FEE_DIVISOR;
  while (g > 1n && netOf(g - 1n) >= net) g -= 1n;
  while (netOf(g) < net) g += 1n;
  check(g <= UINT64_MAX, 'P13_AMOUNT_RANGE', 'required gross exceeds the confidential token range');
  return g;
}

/** Values of one plan-level conservation check. */
export interface ConservationTerms {
  readonly inputs: readonly bigint[];
  readonly outputs: readonly bigint[];
  readonly fees: readonly bigint[];
}

/**
 * Checks `sum(inputs) == sum(outputs) + sum(fees)` exactly within `domain.max`. Outputs must be in `domain`
 * (no zero outputs); inputs and fees in `0..domain.max`. P13-A03. A cleartext arithmetic check of a local plan:
 * it is not a range proof or a conservation proof.
 */
export function checkConservation(terms: ConservationTerms, domain: AmountDomain = EUINT64_DOMAIN): void {
  const { inputs, outputs, fees } = terms;
  check(inputs.length + outputs.length + fees.length <= MAX_TERMS, 'P13_RECORD_LIMIT', 'too many terms');
  check(inputs.length > 0 && outputs.length > 0, 'P13_CONSERVATION', 'inputs and outputs are required');
  for (const v of outputs) assertInDomain(v, domain);
  for (const v of [...inputs, ...fees]) assertInDomain(v, { min: 0n, max: domain.max });
  const sum = (xs: readonly bigint[]): bigint => xs.reduce((acc, x) => checkedAdd(acc, x, domain.max), 0n);
  const inSum = sum(inputs);
  const outSum = checkedAdd(sum(outputs), sum(fees), domain.max);
  if (inSum !== outSum) fail('P13_CONSERVATION', 'inputs do not equal outputs plus fees');
}
