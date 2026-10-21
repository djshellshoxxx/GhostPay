import {
  checkAmount,
  divRound,
  isSmallInt,
  MAX_ASSET_DECIMALS,
  MAX_FIAT_DECIMALS,
  pow10,
} from './decimal.js';
import { err, ok, ROUNDING_MODES, type ParsedRate, type Result, type RoundingMode } from './types.js';

function checkMode(mode: unknown): mode is RoundingMode {
  return typeof mode === 'string' && (ROUNDING_MODES as readonly string[]).includes(mode);
}

/**
 * Convert base-unit token amount to fiat minor units (e.g. cents), exact.
 * fiatMinor = round(amount * rate * 10^fiatDecimals / 10^assetDecimals)
 * @security BigInt only; rounding mode is mandatory and explicit.
 */
export function toFiatMinor(
  amountBase: bigint,
  assetDecimals: number,
  rate: ParsedRate,
  fiatDecimals: number,
  mode: RoundingMode,
): Result<bigint> {
  const a = checkAmount(amountBase);
  if (!a.ok) return a;
  if (!isSmallInt(assetDecimals, MAX_ASSET_DECIMALS)) return err('bad-decimals', 'bad asset decimals');
  if (!isSmallInt(fiatDecimals, MAX_FIAT_DECIMALS)) return err('bad-decimals', 'bad fiat decimals');
  if (!checkMode(mode)) return err('bad-rounding', 'unknown rounding mode');
  if (rate.num <= 0n) return err('rate-zero', 'rate must be positive');
  const n = amountBase * rate.num * pow10(fiatDecimals);
  const d = pow10(rate.scale + assetDecimals);
  return ok(divRound(n, d, mode));
}

/**
 * Reverse: fiat minor units -> base-unit token amount, with explicit rounding.
 * Use 'ceil' when the token amount must cover the fiat value (e.g. paying an
 * invoice), 'floor' when it must not exceed it (e.g. spending cap).
 * @security Direction is required (no default) so callers must choose.
 */
export function fromFiatMinor(
  fiatMinor: bigint,
  fiatDecimals: number,
  rate: ParsedRate,
  assetDecimals: number,
  mode: RoundingMode,
): Result<bigint> {
  const f = checkAmount(fiatMinor);
  if (!f.ok) return f;
  if (!isSmallInt(assetDecimals, MAX_ASSET_DECIMALS)) return err('bad-decimals', 'bad asset decimals');
  if (!isSmallInt(fiatDecimals, MAX_FIAT_DECIMALS)) return err('bad-decimals', 'bad fiat decimals');
  if (!checkMode(mode)) return err('bad-rounding', 'unknown rounding mode');
  if (rate.num <= 0n) return err('rate-zero', 'rate must be positive');
  const n = fiatMinor * pow10(rate.scale + assetDecimals);
  const d = rate.num * pow10(fiatDecimals);
  return checkAmount(divRound(n, d, mode));
}
