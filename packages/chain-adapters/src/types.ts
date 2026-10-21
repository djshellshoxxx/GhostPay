/** 0x-prefixed hex string. */
export type Hex = `0x${string}`;
/** EVM address string (0x + 40 hex). */
export type Address = `0x${string}`;

/** The zero address. */
export const ZERO_ADDRESS: Address = '0x0000000000000000000000000000000000000000';
/** Largest uint256. */
export const MAX_UINT256 = (1n << 256n) - 1n;
