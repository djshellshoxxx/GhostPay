import { fail } from './errors.js';

/**
 * Resource model (docs/chains/tron.md): a TRON tx consumes BANDWIDTH (bytes) and, for smart
 * contract calls, ENERGY. Each is paid first from the account's staked/delegated allowance and
 * free daily bandwidth; any shortfall BURNS TRX at the chain-parameter prices. A fresh stealth
 * address owns no allowance, so a sweep burns TRX, which the address must already hold, or a
 * sponsor must delegate resources to it (privacy cost: links sponsor to stealth address).
 */
export interface TronChainParams {
  /** sun per unit of energy (`getEnergyFee`). */
  readonly energyFeeSun: bigint;
  /** sun per bandwidth byte (`getTransactionFee`). */
  readonly bandwidthFeeSun: bigint;
}

/**
 * Parses `/wallet/getchainparameters`. Fails closed if the expected keys are missing.
 * Key names (`getEnergyFee`, `getTransactionFee`) are from java-tron's proposal list, UNVERIFIED
 * against live docs from the build environment.
 */
export function parseChainParameters(resp: unknown): TronChainParams {
  const list = (resp as { chainParameter?: unknown } | null)?.chainParameter;
  if (!Array.isArray(list)) return fail('INVALID_RESPONSE');
  const find = (key: string): bigint => {
    for (const e of list as { key?: unknown; value?: unknown }[]) {
      if (e?.key === key && typeof e.value === 'number' && Number.isSafeInteger(e.value) && e.value > 0) {
        return BigInt(e.value);
      }
    }
    return fail('INVALID_RESPONSE');
  };
  return { energyFeeSun: find('getEnergyFee'), bandwidthFeeSun: find('getTransactionFee') };
}

/**
 * Typical TRC-20 `transfer` energy (USDT-like). ESTIMATES ONLY (UNVERIFIED): a transfer to a
 * holder that already has a non-zero balance is cheaper than to a fresh holder, because writing a
 * zero -> non-zero storage slot costs more. Real value must come from `triggerconstantcontract`.
 */
export const TYPICAL_TRC20_ENERGY = { existingHolder: 65_000n, freshHolder: 130_000n } as const;

/** Upper bound on bandwidth bytes of a signed tx: raw + 65-byte signature + envelope slack. */
export function estimateBandwidthBytes(rawDataLength: number): bigint {
  return BigInt(rawDataLength) + 65n + 3n + 64n;
}

/** Inputs of {@link estimateBurn}. */
export interface BurnInput {
  readonly params: TronChainParams;
  readonly energy: bigint;
  readonly bandwidthBytes: bigint;
  readonly availableEnergy?: bigint;
  readonly availableBandwidth?: bigint;
}

/** Sun burned for the shortfall of energy and bandwidth. */
export function estimateBurn(i: BurnInput): { energySun: bigint; bandwidthSun: bigint; totalSun: bigint } {
  if (i.energy < 0n || i.bandwidthBytes < 0n) return fail('INVALID_INPUT');
  const eShort = i.energy > (i.availableEnergy ?? 0n) ? i.energy - (i.availableEnergy ?? 0n) : 0n;
  const bShort = i.bandwidthBytes > (i.availableBandwidth ?? 0n) ? i.bandwidthBytes - (i.availableBandwidth ?? 0n) : 0n;
  const energySun = eShort * i.params.energyFeeSun;
  const bandwidthSun = bShort * i.params.bandwidthFeeSun;
  return { energySun, bandwidthSun, totalSun: energySun + bandwidthSun };
}

/** fee_limit that covers `energy` at the current price plus a safety margin in percent (>= 0). */
export function suggestFeeLimit(params: TronChainParams, energy: bigint, marginPercent = 20n): bigint {
  if (energy <= 0n || marginPercent < 0n) return fail('INVALID_INPUT');
  return (energy * params.energyFeeSun * (100n + marginPercent) + 99n) / 100n;
}
