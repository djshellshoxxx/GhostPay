import type { ReactNode } from 'react';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import type { MessageKey } from '../i18n/sourceCatalog';
import { displayMessage, type DisplayMessage } from '../lib/errors';
import { TRANSACTION_PHASE_KEYS } from '../lib/transactionOutcome';

/** Wallet instructions that name an amount or an address. */
const DETAILED: ReadonlySet<MessageKey> = new Set<MessageKey>(['transaction.status.approve', 'transaction.status.revoke', 'transaction.status.permit']);

/**
 * The live-region form of a Pay status (#286 item 5). A screen reader speaks a live region aloud, so a wallet
 * instruction that names an amount or a spender is announced only as its phase. Every other status is returned as is.
 */
export function announcedStatus(status: DisplayMessage): DisplayMessage {
  return typeof status !== 'string' && DETAILED.has(status.key) ? { key: TRANSACTION_PHASE_KEYS['awaiting-authorization'] } : status;
}

/** The current Pay status: announced without amounts or addresses, with the exact instruction kept on screen. */
export function TransactionStatusLine({ status }: { readonly status: DisplayMessage }): ReactNode {
  const t = useI18nOptional()?.t ?? SOURCE_TRANSLATOR.t;
  const announced = announcedStatus(status);
  return (
    <>
      <p role="status" className="status">{displayMessage(announced, t)}</p>
      {announced !== status && <p className="status">{displayMessage(status, t)}</p>}
    </>
  );
}
