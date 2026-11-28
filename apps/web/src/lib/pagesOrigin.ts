import { SOURCE_TRANSLATOR } from '../i18n/source';
import { UserFacingError } from './errors';

// The Pages builder always supplies this value, even for an unbound demonstration build.
// Other static hosts and non-Pages test builds use their own existing deployment policy.
export function pagesOriginAllowsPayments(): boolean {
  return import.meta.env.VITE_GHOSTPAY_PAGES_ORIGIN === undefined || (
    Boolean(globalThis.origin) && globalThis.origin === globalThis.location?.origin &&
    globalThis.origin === import.meta.env.VITE_GHOSTPAY_PAGES_ORIGIN
  );
}

export function assertPagesWalletOrigin(): void {
  if (!pagesOriginAllowsPayments()) throw new UserFacingError({ key: 'app.pagesOriginMismatch' });
}

export function pagesOriginRefusal(): string {
  return SOURCE_TRANSLATOR.t('app.pagesOriginMismatch');
}
