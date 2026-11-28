import { useEffect, useRef, useState, type ReactNode } from 'react';
import { downloadText } from '../components/Common';
import type { InvoiceState, LedgerObservation, ObservationState } from '../features/future/merchant-dashboard/ledger';
import { releaseIfLedgerUnchanged, type LedgerReader } from '../features/future/merchant-dashboard/release';
import { buildDashboardReport, buildPaymentHistoryCsv, type DashboardReport, type ReportInvoice } from '../features/future/merchant-dashboard/report';
import type { DashboardRow } from '../features/future/merchant-dashboard/projection';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import type { MessageKey } from '../i18n/sourceCatalog';
import type { ReconciliationState } from '../lib/reconciliationVault';

type Translate = (key: MessageKey, values?: Record<string, string | number>) => string;

const INVOICE_STATES: readonly InvoiceState[] = ['open', 'expired', 'late', 'ambiguous', 'reorged'];
/** The neutral name downloadText would choose anyway (lib/downloadNames.ts). */
const PAYMENT_EXPORT_NAME = 'export.csv';
const PAYMENT_STATES: readonly ObservationState[] = ['historical', 'unverified', 'imported', 'ambiguous', 'reorged'];

/** Status counts and exact per-asset totals for the records the current filters select. */
export function DashboardReportSection({ invoices, payments, registered, status }: {
  readonly invoices: readonly ReportInvoice[];
  readonly payments: readonly LedgerObservation[];
  readonly registered: readonly DashboardRow[];
  readonly status: Readonly<Record<InvoiceState | ObservationState, MessageKey>>;
}): ReactNode {
  const t: Translate = useI18nOptional()?.t ?? SOURCE_TRANSLATOR.t;
  let report: DashboardReport | undefined;
  try {
    report = buildDashboardReport(invoices, payments, registered);
  } catch {
    report = undefined;
  }
  return <section aria-labelledby="dashboard-report-title" className="dashboard-report">
    <h3 id="dashboard-report-title">{t('dashboard.report')}</h3>
    <p className="hint">{t('dashboard.reportHint')}</p>
    {report === undefined ? <p role="alert">{t('dashboard.reportError')}</p> : <>
      <div className="dashboard-report-states">
        <StateCounts title={t('dashboard.reportInvoiceStates')} states={INVOICE_STATES} counts={report.invoiceStates} status={status} t={t} />
        <StateCounts title={t('dashboard.reportPaymentStates')} states={PAYMENT_STATES} counts={report.paymentStates} status={status} t={t} />
      </div>
      {report.assets.length === 0 ? <p>{t('dashboard.reportEmpty')}</p>
        : <ul className="dashboard-report-assets">{report.assets.map((group) => <li key={group.assetId}>
          <bdi>{group.assetId}</bdi>
          <p>{t('dashboard.reportInvoices', { count: group.invoiceCount, amount: group.expectedAtomic })}</p>
          <p>{t('dashboard.reportVerified', { count: group.verifiedPayments, amount: group.verifiedAtomic })}</p>
          <p>{t('dashboard.reportLinked', { amount: group.linkedVerifiedAtomic })}</p>
        </li>)}</ul>}
      <p>{t('dashboard.reportExcluded', { count: report.excludedPayments })}</p>
    </>}
  </section>;
}

function StateCounts<S extends InvoiceState | ObservationState>({ title, states, counts, status, t }: {
  readonly title: string;
  readonly states: readonly S[];
  readonly counts: Readonly<Record<S, number>>;
  readonly status: Readonly<Record<InvoiceState | ObservationState, MessageKey>>;
  readonly t: Translate;
}): ReactNode {
  return <div>
    <h4>{title}</h4>
    <ul>{states.map((state) => <li key={state}>{t('dashboard.reportStateCount', { status: t(status[state]), count: counts[state] })}</li>)}</ul>
  </div>;
}

/**
 * Consent-gated transaction history CSV. The selection is captured at preview; the file is released only after a
 * fresh authenticated ledger read still matches the reviewed one. Remount (via key) revokes a pending preview.
 */
export function PaymentHistoryExport({ payments, chain, fingerprint, ledgerFingerprint, openLedger, stillCurrent, onStale, onPreview }: {
  readonly payments: readonly LedgerObservation[];
  readonly chain: number;
  readonly fingerprint: string;
  readonly ledgerFingerprint: (state: ReconciliationState) => string;
  readonly openLedger: () => Promise<LedgerReader>;
  readonly stillCurrent: () => boolean;
  readonly onStale: () => void;
  readonly onPreview?: () => void;
}): ReactNode {
  const t: Translate = useI18nOptional()?.t ?? SOURCE_TRANSLATOR.t;
  const [preview, setPreview] = useState<readonly LedgerObservation[]>();
  const [failed, setFailed] = useState(false);
  const previewButton = useRef<HTMLButtonElement>(null);
  const mounted = useRef(true);
  const attempt = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; attempt.current++; };
  }, []);
  const verified = preview?.filter(({ state }) => state === 'historical').length ?? 0;
  return <section aria-labelledby="dashboard-payment-export-title">
    <h3 id="dashboard-payment-export-title">{t('dashboard.paymentExport')}</h3>
    <p>{t('dashboard.paymentExportDisclosure')}</p>
    <button ref={previewButton} className="btn" type="button" disabled={payments.length === 0} onClick={() => {
      attempt.current++;
      setFailed(false);
      onPreview?.();
      setPreview([...payments]);
    }}>{t('dashboard.paymentPreview')}</button>
    {preview !== undefined && <div className="dashboard-actions">
      <p role="status">{t('dashboard.paymentPreviewCount', { count: preview.length, verified })}</p>
      <button className="btn" type="button" onClick={() => {
        const selected = preview;
        previewButton.current?.focus();
        setPreview(undefined);
        const approval = ++attempt.current;
        const current = (): boolean => mounted.current && approval === attempt.current && stillCurrent();
        void (async () => {
          try {
            const file = buildPaymentHistoryCsv(selected, chain);
            const released = await releaseIfLedgerUnchanged(openLedger, fingerprint, ledgerFingerprint, () => {
              downloadText(PAYMENT_EXPORT_NAME, file.content, file.mimeType);
            }, current);
            if (!released && current()) onStale();
          } catch {
            if (current()) setFailed(true);
          }
        })();
      }}>{t('dashboard.download')}</button>
      <button className="btn" type="button" onClick={() => { attempt.current++; previewButton.current?.focus(); setPreview(undefined); }}>{t('dashboard.cancel')}</button>
    </div>}
    {failed && <p role="alert">{t('dashboard.paymentExportError')}</p>}
  </section>;
}
