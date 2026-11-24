import { parsePublicMetaQr as parseSharedPublicMetaQr } from '@ghostpay/qr-exchange';
import { UserFacingError } from './errors';

/** Only public scheme-1 keys; parsing never performs a registry action or opens a URL. */
export function parsePublicMetaQr(text: string): string {
  try { return parseSharedPublicMetaQr(text); }
  catch { throw new UserFacingError({ key: 'error.qrPayload.thisQRDoesNotContainASupportedPublicMetaAddress' }); }
}

// i18n-use: error.qrPayload.thisQRDoesNotContainASupportedPublicMetaAddress
