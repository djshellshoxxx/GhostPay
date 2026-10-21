import { bytesToHex, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { SecretBox } from '@ghostpay/secret-box';
import { PayerSponsorError } from '../errors.js';
import type { PaymasterSigner } from './types.js';

/** Chain ids the sponsor key must NOT hold funds on (common mainnets; operator may extend). */
export const KNOWN_MAINNET_CHAIN_IDS: readonly number[] = [1, 10, 56, 137, 8453, 42161, 43114];

/**
 * Builds the paymaster signer and its address from a SecretBox holding a 32-byte private key. The key
 * is read inside `use()` on every signature and never stored or logged (SP-REQ-3).
 *
 * @param key SecretBox with the verifying-signer private key.
 * @returns The signer function and the signer address.
 * @throws PayerSponsorError `INVALID_ARGUMENT` if the box is not 32 bytes.
 */
export function paymasterSignerFromBox(key: SecretBox): { readonly sign: PaymasterSigner; readonly address: Address } {
  if (key.length !== 32) throw new PayerSponsorError('INVALID_ARGUMENT', 'key must be 32 bytes');
  const address = key.use((b) => privateKeyToAccount(bytesToHex(b)).address);
  const sign: PaymasterSigner = (hash: Hex) =>
    key.useAsync((b) => privateKeyToAccount(bytesToHex(b)).signMessage({ message: { raw: hash } }));
  return { sign, address };
}

/**
 * Refuses a hot key that holds a balance on any known mainnet (SP-REQ-3): the sponsor key is a
 * throw-away testnet key.
 *
 * @param address Hot-key address.
 * @param balanceOf Reads the native balance of `address` on a chain id (operator supplied; may call RPCs).
 * @param chainIds Chain ids to probe (default {@link KNOWN_MAINNET_CHAIN_IDS}).
 * @throws PayerSponsorError `MAINNET_FORBIDDEN` when any balance is non-zero.
 */
export async function assertKeyNotFundedOnMainnet(
  address: Address,
  balanceOf: (chainId: number, address: Address) => Promise<bigint>,
  chainIds: readonly number[] = KNOWN_MAINNET_CHAIN_IDS,
): Promise<void> {
  for (const id of chainIds) {
    if ((await balanceOf(id, address)) > 0n) {
      throw new PayerSponsorError('MAINNET_FORBIDDEN', 'sponsor key holds funds on a mainnet chain id');
    }
  }
}
