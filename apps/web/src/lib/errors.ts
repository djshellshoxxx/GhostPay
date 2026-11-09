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

/** A safe render-time value: no arbitrary exception or sensitive cause is retained. */
export type DisplayMessage = string | MessageDescriptor | {
  readonly invoiceMessage: MessageKey;
  readonly field: string;
};

/** Capture only public diagnostics and formatting arguments for later rendering. */
export function captureUserMessage(error: unknown): DisplayMessage {
  if (error instanceof LocalizedTypeError) return error.translation;
  if (error instanceof UserFacingError) return error.translation ?? error.message;
  if (error instanceof InvoiceError) {
    const key = INVOICE_TEXT[error.code] ?? 'error.invoice.rejected';
    return error.code === 'SCHEMA' && error.path !== undefined
      ? { invoiceMessage: key, field: error.path }
      : { key };
  }
  if (error instanceof ChainAdapterError) return { key: 'error.chain', values: { code: error.code } };
  if (error instanceof GhostPayCryptoError) return { key: 'error.crypto', values: { code: error.code } };
  return { key: 'error.unknown' };
}

/** Render existing trusted copy or a public descriptor with the language current now. */
export function displayMessage(message: DisplayMessage, t: Translator['t'] = SOURCE_TRANSLATOR.t): string {
  if (typeof message === 'string') return message;
  if ('invoiceMessage' in message) return t('error.invoice.field', { message: t(message.invoiceMessage), field: message.field });
  return t(message.key, message.values);
}

/** Maps any thrown value to safe user text; raw RPC details, inputs and causes are never rendered. */
export function userMessage(error: unknown, t: Translator['t'] = SOURCE_TRANSLATOR.t): string {
  return displayMessage(captureUserMessage(error), t);
}

// i18n-use: error.invoice.fragmentFormat error.invoice.fragmentTooLarge error.invoice.base64url error.invoice.utf8 error.invoice.json error.invoice.schema error.invoice.nonCanonical error.invoice.decrypt error.invoice.signing error.invoice.randomness error.invoice.unsupported error.invoice.passphrase error.invoice.passphraseRequired error.invoice.passphraseUnexpected error.invoice.passphrasePolicy
