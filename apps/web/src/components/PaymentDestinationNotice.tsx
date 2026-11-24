import { invoiceDigest, type ParsedInvoice } from '@ghostpay/invoice-schema';
import type { BuiltPayment } from '@ghostpay/chain-adapters';
import { bytesToHex } from '@noble/hashes/utils.js';
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import { ATTEMPT_JOURNAL_EVENT, paymentHistoryNotice } from '../lib/duplicateAttemptJournal';
import { walletAttemptKey, type WalletSession } from '../lib/wallet';
import { Notice } from './Common';

function subscribeAttempts(refresh: () => void): () => void {
  window.addEventListener(ATTEMPT_JOURNAL_EVENT, refresh);
  // A same-origin frame in the same tab shares sessionStorage and receives a native storage event.
  window.addEventListener('storage', refresh);
  return () => {
    window.removeEventListener(ATTEMPT_JOURNAL_EVENT, refresh);
    window.removeEventListener('storage', refresh);
  };
}

/** Mounted from connection onward so an account change during preparation also invalidates the advisory. */
export function PaymentDestinationNotice({ wallet, built, invoice }: {
  readonly wallet: WalletSession;
  readonly built: BuiltPayment | undefined;
  readonly invoice: ParsedInvoice['invoice'];
}): ReactNode {
  const t = useI18nOptional()?.t ?? SOURCE_TRANSLATOR.t;
  const [invalidated, setInvalidated] = useState<WalletSession>();
  useEffect(() => {
    const provider = wallet.wallet.provider;
    if (provider.on === undefined || provider.removeListener === undefined) return;
    const invalidate = (): void => { setInvalidated(wallet); };
    const events = ['accountsChanged', 'chainChanged', 'disconnect'];
    try { for (const event of events) provider.on(event, invalidate); } catch { invalidate(); }
    return () => {
      for (const event of events) {
        try { provider.removeListener?.(event, invalidate); } catch { /* An extension may already have disconnected. */ }
      }
    };
  }, [wallet]);
  const key = useMemo(() => built === undefined ? undefined : walletAttemptKey(wallet, built.tx, {
    kind: 'payment', scope: bytesToHex(invoiceDigest(invoice)),
  }), [built, invoice, wallet]);
  const notice = useSyncExternalStore(subscribeAttempts, () =>
    built === undefined || key === undefined || invalidated === wallet ? undefined :
      paymentHistoryNotice({ chainId: wallet.chainId, account: wallet.account, key }, built.preview.stealth));
  const messages = {
    destination: 'pay.history.destination',
    invoice: 'pay.history.invoice',
    'invoice-destination': 'pay.history.invoiceDestination',
    unavailable: 'pay.history.unavailable',
  } as const;
  return <div aria-live="polite">{notice !== undefined &&
    <Notice kind={notice === 'destination' ? 'warn' : 'info'}>{t(messages[notice])}</Notice>
  }</div>;
}

// i18n-use: pay.history.destination pay.history.invoice pay.history.invoiceDestination pay.history.unavailable
