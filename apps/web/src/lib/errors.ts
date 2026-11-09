import { ChainAdapterError } from '@ghostpay/chain-adapters';
import { GhostPayCryptoError } from '@ghostpay/core-crypto';
import { InvoiceError } from '@ghostpay/invoice-schema';
import { SOURCE_TRANSLATOR } from '../i18n/source';
import type { MessageKey } from '../i18n/catalog';
import type { MessageValues } from '../i18n/message';
import type { Translator } from '../i18n/translator';

/** Store public formatting arguments, never exception details or secret-bearing inputs. */
export interface MessageDescriptor {
  readonly key: MessageKey;
  readonly values?: MessageValues;
}

/** A typed parser failure with a catalog-backed public message; remains a TypeError. */
export class LocalizedTypeError extends TypeError {
  public constructor(public readonly translation: MessageDescriptor) {
    super(SOURCE_TRANSLATOR.t(translation.key, translation.values));
    this.name = 'TypeError';
  }
}

/** An error whose message is already safe and written for the end user. */
export class UserFacingError extends Error {
  public readonly translation: MessageDescriptor | undefined;
  public constructor(message: string | MessageDescriptor) {
    super(typeof message === 'string' ? message : SOURCE_TRANSLATOR.t(message.key, message.values));
    this.translation = typeof message === 'string' ? undefined : message;
    this.name = 'UserFacingError';
  }
}

const INVOICE_TEXT: Readonly<Record<string, MessageKey>> = {
  FRAGMENT_FORMAT: 'error.invoice.fragmentFormat',
  FRAGMENT_TOO_LARGE: 'error.invoice.fragmentTooLarge',
  BASE64URL: 'error.invoice.base64url',
  UTF8: 'error.invoice.utf8',
  JSON: 'error.invoice.json',
  SCHEMA: 'error.invoice.schema',
  NON_CANONICAL: 'error.invoice.nonCanonical',
  DECRYPT: 'error.invoice.decrypt',
  SIGNING: 'error.invoice.signing',
  RANDOMNESS: 'error.invoice.randomness',
  UNSUPPORTED: 'error.invoice.unsupported',
  PASSPHRASE: 'error.invoice.passphrase',
  PASSPHRASE_REQUIRED: 'error.invoice.passphraseRequired',
  PASSPHRASE_UNEXPECTED: 'error.invoice.passphraseUnexpected',
  PASSPHRASE_POLICY: 'error.invoice.passphrasePolicy',
};

/**
 * Maps any thrown value to text that is safe to show. Messages never include user input, links, keys or RPC URLs.
 */
export function userMessage(error: unknown, t: Translator['t'] = SOURCE_TRANSLATOR.t): string {
  if (error instanceof LocalizedTypeError) return t(error.translation.key, error.translation.values);
  if (error instanceof UserFacingError) return error.translation === undefined ? error.message : t(error.translation.key, error.translation.values);
  if (error instanceof InvoiceError) {
    const base = t(INVOICE_TEXT[error.code] ?? 'error.invoice.rejected');
    return error.code === 'SCHEMA' && error.path !== undefined ? t('error.invoice.field', { message: base, field: error.path }) : base;
  }
  if (error instanceof ChainAdapterError) {
    return t('error.chain', { code: error.code });
  }
  if (error instanceof GhostPayCryptoError) {
    return t('error.crypto', { code: error.code });
  }
  return t('error.unknown');
}

// i18n-use: error.invoice.fragmentFormat error.invoice.fragmentTooLarge error.invoice.base64url error.invoice.utf8 error.invoice.json error.invoice.schema error.invoice.nonCanonical error.invoice.decrypt error.invoice.signing error.invoice.randomness error.invoice.unsupported error.invoice.passphrase error.invoice.passphraseRequired error.invoice.passphraseUnexpected error.invoice.passphrasePolicy
