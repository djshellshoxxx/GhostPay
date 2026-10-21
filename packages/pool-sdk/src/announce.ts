import { deriveStealthPayment, buildErc20Metadata, buildNativeMetadata, type RandomSource } from '@ghostpay/core-crypto';
import { bytesToHex, encodeAbiParameters, getAddress, zeroAddress, type Address, type Hex } from 'viem';
import { fail } from './errors.js';
import { assertValue } from './field.js';

/**
 * Builds the SP-PAY recipient and `announce` bytes for the seller's stealth meta-address.
 *
 * The pool contract validates the metadata as the router does and emits the ERC-5564 announcement with
 * the pool as `caller`, so the payer address never appears.
 *
 * @param sellerMeta Scheme-1 `st:eth:0x...` meta-address.
 * @param rng Test-only RNG override.
 * @param token ERC-20 address, or the zero address for a native pool.
 * @param netValue Net value delivered to the stealth address (`withdrawnValue - relayerFee`).
 * @throws PoolSdkError `INVALID_INPUT`; core-crypto errors for a bad meta-address.
 * @security The announcement is public: it reveals token, net value and the seller's one-time address.
 */
export function buildSpPayAnnounce(
  sellerMeta: string,
  rng: RandomSource | undefined,
  token: Address,
  netValue: bigint,
): { recipient: Address; announce: Hex } {
  assertValue(netValue, 'netValue');
  const d = deriveStealthPayment(sellerMeta, rng);
  const native = getAddress(token) === zeroAddress;
  const metadata = native ? buildNativeMetadata(d.viewTag, netValue) : buildErc20Metadata(d.viewTag, token, netValue);
  if (metadata.length !== 57) fail('INVALID_INPUT', 'metadata length');
  const announce = encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], [bytesToHex(d.ephemeralPublicKey), bytesToHex(metadata)]);
  return { recipient: d.stealthAddress, announce };
}
