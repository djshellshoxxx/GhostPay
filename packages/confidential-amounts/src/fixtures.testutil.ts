import { privateKeyToAccount } from 'viem/accounts';
import { getAddress, type Address, type Hex } from 'viem';
import type { CtPayParams, StealthSigner } from './types.js';

export const ROUTER: Address = getAddress('0x00000000000000000000000000000000000000a1');
export const TOKEN: Address = getAddress('0x00000000000000000000000000000000000000b2');
export const FEE_RECIPIENT: Address = getAddress('0x00000000000000000000000000000000000000c3');
export const PAYER: Address = getAddress('0x00000000000000000000000000000000000000d4');
export const OTHER: Address = getAddress('0x00000000000000000000000000000000000000e5');
export const DEST: Address = getAddress('0x00000000000000000000000000000000000000f6');
export const EPH: Hex = `0x02${'11'.repeat(32)}`;
export const NOW = 1_800_000_000;

/** A deterministic throw-away key (test only). */
export const STEALTH_KEY: Hex = `0x${'0a'.repeat(32)}`;
export const STEALTH: Address = privateKeyToAccount(STEALTH_KEY).address;

/** Signer that records whether its key was requested. */
export function makeSigner(key: Hex = STEALTH_KEY): StealthSigner & { calls: number } {
  const address = privateKeyToAccount(key).address;
  const s = {
    address,
    calls: 0,
    withKey: <T>(fn: (k: Hex) => Promise<T>): Promise<T> => {
      s.calls++;
      return fn(key);
    },
  };
  return s;
}

export function payParams(over: Partial<CtPayParams> = {}): CtPayParams {
  return {
    chainId: 31337,
    router: ROUTER,
    token: TOKEN,
    stealth: STEALTH,
    gross: 1_000_000n,
    deadline: BigInt(NOW + 3600),
    bufferWei: 0n,
    ephemeralPubKey: EPH,
    viewTag: 0xab,
    payer: PAYER,
    ...over,
  };
}

/** Deterministic handle source for the ledger: counter-based 32 bytes. */
export function counterRandom(): () => Uint8Array {
  let n = 0;
  return () => {
    n++;
    const b = new Uint8Array(32);
    new DataView(b.buffer).setUint32(28, n);
    b[0] = 0x99;
    return b;
  };
}
