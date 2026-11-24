import type { InvoicePaymentSummary as PaymentSummary } from '@ghostpay/ux-vault/portable';
import type { ReactNode } from 'react';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import type { MessageKey } from '../i18n/catalog';

const COMPARISON: Record<PaymentSummary['kind'], MessageKey> = {
  unavailable: 'ledger.amounts.unavailable',
  unlinked: 'ledger.amounts.unlinked',
  below: 'ledger.amounts.below',
  equal: 'ledger.amounts.equal',
  above: 'ledger.amounts.above',
};

/** An amount comparison of seller annotations, never a paid/unpaid or settlement badge. */
export function InvoicePaymentSummary({ summary }: { readonly summary: PaymentSummary }): ReactNode {
  const t = useI18nOptional()?.t ?? SOURCE_TRANSLATOR.t;
  return (
    <section aria-label={t('ledger.amounts.heading')}>
      <p><strong>{t(COMPARISON[summary.kind])}</strong></p>
      {summary.kind !== 'unavailable' && summary.kind !== 'unlinked' && (
        <>
          <p>{t('ledger.amounts.total', { observed: summary.observedMinorUnits, expected: summary.expectedMinorUnits })}</p>
          <p>{t('ledger.amounts.count', { count: summary.observationCount })}</p>
          {summary.observationCount > 1 && <p className="hint">{t('ledger.amounts.multiple')}</p>}
        </>
      )}
      <p className="hint">{t('ledger.amounts.evidence')}</p>
    </section>
  );
}
