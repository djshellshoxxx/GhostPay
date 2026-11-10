import { CHAINS } from '@ghostpay/chain-adapters';
import { exportSellerPairing as sharedExport, parseSellerPairing as sharedParse, type SellerPairingConfig, type SellerPairingSource } from '@ghostpay/qr-exchange';
import { UserFacingError } from './errors';

export { SELLER_PAIRING_FORMAT, SELLER_PAIRING_VERSION, MAX_SELLER_PAIRING_BYTES, MAX_PAIRING_CHAINS, compareToLoaded, type SellerPairingConfig, type SellerPairingSource } from '@ghostpay/qr-exchange';

const SUPPORTED_CHAINS = CHAINS.filter((chain) => chain.enabled && chain.testnet).map((chain) => chain.chainId);
/** Public pairing must not advertise unknown or disabled payment networks as supported. */
export function isSupportedPairingChain(chainId: number): boolean { return SUPPORTED_CHAINS.includes(chainId); }

function localized<T>(operation: () => T): T {
  try { return operation(); }
  catch { throw new UserFacingError({ key: 'error.sellerPairing.invalid' }); }
}

export function exportSellerPairing(source: SellerPairingSource, chainIds: readonly number[]): string {
  return localized(() => sharedExport(source, chainIds, SUPPORTED_CHAINS));
}
export function parseSellerPairing(text: string): SellerPairingConfig {
  return localized(() => sharedParse(text, SUPPORTED_CHAINS));
}

// i18n-use: error.sellerPairing.invalid
