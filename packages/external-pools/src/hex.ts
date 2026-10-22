import type { Hex } from 'viem';

/**
 * Narrows a string that is known to be `0x`-prefixed hex to viem's `Hex` type.
 *
 * @param s String built as `0x...` by the caller.
 * @returns The same string typed as `Hex`. No validation is done here.
 */
export function asHex(s: string): Hex {
  return s as Hex;
}
