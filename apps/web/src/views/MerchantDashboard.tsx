import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { downloadText, Field } from '../components/Common';
import { summarizeDashboardProjection } from '../features/future/merchant-dashboard/analytics';
import { DashboardExportCoordinator, type DashboardExportFormat, type DashboardExportPreview } from '../features/future/merchant-dashboard/export';
import { invoiceState, observationTime, readMerchantDashboard, utcRange, type InvoiceState, type LedgerObservation, type ObservationState } from '../features/future/merchant-dashboard/ledger';
import { selectDashboardRows } from '../features/future/merchant-dashboard/select';
import type { DashboardContext } from '../features/future/merchant-dashboard/model';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import type { MessageKey } from '../i18n/sourceCatalog';
import { subscribeAppLock } from '../lib/appLock';
import { createCurrentReconciliationVault, releaseFromCurrentReconciliationState, subscribeReconciliationChanges, type ReconciliationState } from '../lib/reconciliationVault';
import { checkpointKeyId } from '../lib/scanClient';
import { getSessionPublic, subscribeSession, type SessionPublic } from '../lib/session';
import { useServices } from '../lib/services';
import { useApp } from '../state';

const PAGE_SIZE = 25;
const EXPORT_COLUMNS = ['chainId', 'assetId', 'expiresAt', 'expectedAtomic'] as const;
const STATUS: Record<InvoiceState | ObservationState, MessageKey> = {
  open: 'dashboard.state.open', expired: 'dashboard.state.expired', late: 'dashboard.state.late',
  ambiguous: 'dashboard.state.ambiguous', reorged: 'dashboard.state.reorged',
  historical: 'dashboard.state.historical', imported: 'dashboard.state.imported',
};
type LoadedDashboard = Awaited<ReturnType<typeof readMerchantDashboard>> & {
  readonly context: DashboardContext;
  readonly loadedAt: number;
  readonly fingerprint: string;
  readonly readOnly: boolean;
};
type ViewState = 'locked' | 'loading' | 'refreshing' | 'ready' | 'error';
type ExportConsent = { readonly preview: DashboardExportPreview; readonly totals: ReadonlyMap<string, bigint>; readonly selectedAt: number };

function expiryChanged(data: LoadedDashboard, status: string, from: number, to: number): boolean {
  return (status === 'open' || status === 'expired') && data.projection.rows.some(({ expiresAt }) =>
    (from < expiresAt * 1000) !== (to < expiresAt * 1000));
}

function ledgerFingerprint(state: ReconciliationState): string {
  const bytes = new TextEncoder().encode(JSON.stringify([state.invoices, state.records, state.readOnly]));
  try {
    return bytesToHex(sha256(bytes));
  } finally {
    bytes.fill(0);
  }
}

export default function MerchantDashboard(): ReactNode {
  const app = useApp();
  const { chains } = useServices();
  const t = useI18nOptional()?.t ?? SOURCE_TRANSLATOR.t;
  const [chain, setChain] = useState(chains[0]?.chainId);
  return (
    <section className="panel merchant-dashboard" aria-labelledby="merchant-dashboard-title">
      <h2 id="merchant-dashboard-title">{t('app.nav.dashboard')}</h2>
      {app.session === undefined ? (
        <p>{t('dashboard.keys')} <button type="button" className="btn" onClick={() => { app.setView('seller'); }}>{t('app.nav.seller')}</button></p>
      ) : <>
        <Field label={t('dashboard.network')}>{(id) => (
          <select id={id} value={chain ?? ''} onChange={(event) => { setChain(Number(event.target.value)); }}>
            {chains.map((entry) => <option key={entry.chainId} value={entry.chainId}>{entry.name}</option>)}
          </select>
        )}</Field>
        {chain === undefined ? <p role="alert">{t('dashboard.error')}</p>
          : <DashboardScope key={chain} chain={chain} session={app.session} />}
      </>}
    </section>
  );
}

function DashboardScope({ chain, session }: { readonly chain: number; readonly session: SessionPublic }): ReactNode {
  const app = useApp();
  const i18n = useI18nOptional();
  const t = i18n?.t ?? SOURCE_TRANSLATOR.t;
  const [viewState, setViewState] = useState<ViewState>('locked');
  const [data, setData] = useState<LoadedDashboard>();
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'invoices' | 'payments'>('invoices');
  const [status, setStatus] = useState('');
  const [newest, setNewest] = useState(true);
  const [from, setFrom] = useState('');
  const [through, setThrough] = useState('');
  const [page, setPage] = useState(0);
  const [format, setFormat] = useState<DashboardExportFormat>('csv');
  const [preview, setPreview] = useState<ExportConsent>();
  const [exportError, setExportError] = useState(false);
  const [clock, setClock] = useState(Date.now);
  const [exporter] = useState(() => new DashboardExportCoordinator());
  const active = useRef<AbortController | undefined>(undefined);
  const enabled = useRef(false);
  const revision = useRef(0);
  const exportRevision = useRef(0);
  const focusAfterRead = useRef(false);
  const readStatus = useRef<HTMLParagraphElement>(null);
  const overview = useRef<HTMLHeadingElement>(null);
  const retry = useRef<HTMLButtonElement>(null);
  const previewButton = useRef<HTMLButtonElement>(null);
  const previewControls = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!focusAfterRead.current) return;
    if (viewState === 'loading' || viewState === 'refreshing') {
      readStatus.current?.focus();
      return;
    }
    focusAfterRead.current = false;
    if (document.activeElement === document.body) {
      if (viewState === 'ready') overview.current?.focus();
      if (viewState === 'error') retry.current?.focus();
    }
  }, [viewState]);
  const seller = checkpointKeyId(session.spendingPublicKey, session.viewingPublicKey);

  const load = useCallback((refresh = false): void => {
    if (getSessionPublic() !== session) return;
    if (refresh && overview.current?.closest('.merchant-dashboard')?.contains(document.activeElement)) {
      focusAfterRead.current = true;
    }
    active.current?.abort();
    const operation = new AbortController();
    active.current = operation;
    enabled.current = true;
    exportRevision.current++;
    exporter.cancel();
    setPreview(undefined);
    setExportError(false);
    setData(undefined);
    setViewState(refresh ? 'refreshing' : 'loading');
    const id = 'read:' + ++revision.current;
    const scope = { operationId: id, sessionEpoch: revision.current, profileRef: seller, revision: id };
    const current = (): boolean => !operation.signal.aborted && getSessionPublic() === session;
    const context: DashboardContext = {
      ...scope, signal: operation.signal, deadlineMs: Number.MAX_SAFE_INTEGER, nowMs: Date.now,
      current: () => {
        if (!current()) throw new Error('dashboard scope changed');
        return scope;
      },
    };
    void (async () => {
      try {
        const vault = await createCurrentReconciliationVault(chain, seller);
        try {
          if (!current()) return;
          const state = await vault.readState();
          if (!current()) return;
          const next = await readMerchantDashboard(state, chain, seller, context);
          if (!current()) return;
          const loadedAt = Date.now();
          setClock(loadedAt);
          setData({ ...next, context, loadedAt, fingerprint: ledgerFingerprint(state), readOnly: state.readOnly });
          setPage(0);
          setViewState('ready');
        } finally {
          vault.lock();
        }
      } catch {
        if (current()) setViewState('error');
      }
    })();
  }, [chain, exporter, seller, session]);

  useEffect(() => {
    const lock = (): void => {
      enabled.current = false;
      focusAfterRead.current = false;
      active.current?.abort();
      exportRevision.current++;
      exporter.cancel();
      setData(undefined);
      setPreview(undefined);
      setExportError(false);
      setQuery('');
      setPage(0);
      setViewState('locked');
    };
    const unsubscribeLock = subscribeAppLock(lock);
    const unsubscribeSession = subscribeSession(lock);
    lock();
    const unsubscribeChanges = subscribeReconciliationChanges(() => {
      if (!enabled.current) return;
      // An in-flight refresh also needs revocation because a mutation may have won after the read.
      load(true);
    });
    return () => {
      unsubscribeLock();
      unsubscribeSession();
      unsubscribeChanges();
      enabled.current = false;
      active.current?.abort();
      exporter.cancel();
    };
  }, [exporter, load]);

  useEffect(() => {
    if (data === undefined) return;
    const update = (): void => {
      const time = Date.now();
      if (preview !== undefined && expiryChanged(data, status, preview.selectedAt, time)) {
        if (previewControls.current?.contains(document.activeElement)) overview.current?.focus();
        exporter.cancel();
        setPreview(undefined);
      }
      setClock(time);
    };
    const interval = setInterval(update, 15_000);
    window.addEventListener('focus', update);
    return () => { clearInterval(interval); window.removeEventListener('focus', update); };
  }, [data, exporter, preview, status]);

  const change = (update: () => void): void => {
    exportRevision.current++;
    exporter.cancel();
    setPreview(undefined);
    setExportError(false);
    setPage(0);
    update();
  };

  if (data === undefined || getSessionPublic() !== session || data.context.signal.aborted) {
    if (viewState === 'loading' || viewState === 'refreshing') {
      return <p key="read-progress" ref={readStatus} tabIndex={-1} role="status">{t(viewState === 'loading' ? 'dashboard.loading' : 'dashboard.stale')}</p>;
    }
    return <>
      <p role={viewState === 'error' ? 'alert' : undefined}>{t(viewState === 'error' ? 'dashboard.error' : 'dashboard.locked')}</p>
      <button ref={retry} className="btn" type="button" onClick={() => { focusAfterRead.current = true; load(); }}>{t(viewState === 'error' ? 'dashboard.retry' : 'dashboard.open')}</button>
    </>;
  }

  const now = Math.floor(clock / 1000);
  const statuses: readonly (InvoiceState | ObservationState)[] = kind === 'invoices'
    ? ['open', 'expired', 'late', 'ambiguous', 'reorged'] : ['historical', 'imported', 'ambiguous', 'reorged'];
  const range = utcRange(from, through);
  const inRange = (seconds: number | undefined): boolean => range !== undefined &&
    (seconds === undefined ? from === '' && through === '' : seconds >= range[0] && seconds < range[1]);
  const scopedObservations = new Map<string, LedgerObservation[]>();
  for (const payment of data.payments) {
    for (const ref of payment.invoiceRefs) {
      const linked = scopedObservations.get(ref) ?? [];
      linked.push(payment);
      scopedObservations.set(ref, linked);
    }
  }
  const summaries = summarizeDashboardProjection(data.projection, now, data.context);
  const invoiceRows = [];
  for (let offset = 0; offset < data.projection.rows.length; offset += 100) {
    const selected = selectDashboardRows(data.projection, { search: query.trim(), offset, limit: 100 }, data.context);
    invoiceRows.push(...selected.rows);
    if (offset + 100 >= selected.totalMatches) break;
  }
  const invoices = invoiceRows.map((row) => ({ row, state: invoiceState(row, scopedObservations.get(row.invoiceRef) ?? [], now) }))
    .filter((entry) => inRange(entry.row.expiresAt) && (kind !== 'invoices' || status === '' || entry.state === status))
    .sort((a, b) => (newest ? b.row.expiresAt - a.row.expiresAt : a.row.expiresAt - b.row.expiresAt));
  const payments = data.payments.filter(({ record, state, invoiceRefs }) => {
    const needle = query.trim().toLowerCase();
    return inRange(state === 'ambiguous' ? undefined : observationTime(record)) && (status === '' || state === status) &&
      (record.transactionHash.includes(needle) || invoiceRefs.some((ref) => ref.includes(needle)));
  }).sort((a, b) => {
    const first = a.state === 'ambiguous' ? undefined : observationTime(a.record);
    const second = b.state === 'ambiguous' ? undefined : observationTime(b.record);
    if (first === undefined) return second === undefined ? 0 : 1;
    if (second === undefined) return -1;
    return newest ? second - first : first - second;
  });
  const date = new Intl.DateTimeFormat(i18n?.requestedLocale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' });
  const count = kind === 'invoices' ? invoices.length : payments.length;
  const offset = Math.min(page, Math.max(0, Math.ceil(count / PAGE_SIZE) - 1)) * PAGE_SIZE;
  const pageRows = kind === 'invoices'
    ? invoices.slice(offset, offset + PAGE_SIZE).map(({ row, state }) => ({
      id: row.invoiceRef, state, amount: row.expectedAtomic, asset: row.assetId, timestamp: row.expiresAt,
      source: undefined, invoiceRefs: [], provenance: undefined,
    }))
    : payments.slice(offset, offset + PAGE_SIZE).map(({ record, state, invoiceRefs }) => ({
      id: record.transactionHash + ':' + record.logIndex, state, amount: state === 'ambiguous' ? undefined : record.amountMinorUnits,
      asset: state === 'ambiguous' ? undefined : record.asset, timestamp: state === 'ambiguous' ? undefined : observationTime(record),
      source: state === 'ambiguous' ? undefined : record.recordedAt, invoiceRefs,
      provenance: state === 'ambiguous' ? undefined : record.provenance,
    }));

  return <>
    <p>{t('dashboard.coverage')}</p>
    <p>{t('dashboard.readAt', { time: date.format(data.loadedAt) })}</p>
    {data.readOnly && <p>{t('dashboard.readOnly')}</p>}
    <div className="dashboard-actions">
      <button className="btn" type="button" onClick={() => { focusAfterRead.current = true; load(true); }}>{t('dashboard.refresh')}</button>
      <button className="btn" type="button" onClick={() => { app.setView('scan'); }}>{t('dashboard.backup')}</button>
    </div>
    <h3 ref={overview} tabIndex={-1}>{t('dashboard.overview')}</h3>
    <p>{t('dashboard.counts', { invoices: data.projection.rows.length, payments: data.payments.length })}</p>
    {summaries.groups.length > 0 && <ul>{summaries.groups.map((group) =>
      <li key={group.assetId}><bdi>{group.assetId}</bdi>{' '}{t('dashboard.expectedTotal', { amount: group.expectedAtomic })}</li>)}</ul>}
    <div className="dashboard-fields">
      <Field label={t('dashboard.list')}>{(id) => <select id={id} value={kind} onChange={(e) => {
        const value = e.target.value;
        change(() => { setKind(value === 'payments' ? 'payments' : 'invoices'); setStatus(''); });
      }}><option value="invoices">{t('dashboard.invoices')}</option><option value="payments">{t('dashboard.payments')}</option></select>}</Field>
      <Field label={t('dashboard.search')}>{(id) => <input id={id} type="search" autoComplete="off" maxLength={256} value={query} onChange={(e) => { change(() => { setQuery(e.target.value); }); }} />}</Field>
      <Field label={t('dashboard.status')}>{(id) => <select id={id} value={status} onChange={(e) => { change(() => { setStatus(e.target.value); }); }}>
        <option value="">{t('dashboard.all')}</option>
        {statuses.map((item) =>
          <option key={item} value={item}>{t(STATUS[item])}</option>)}
      </select>}</Field>
      <Field label={t('dashboard.sort')}>{(id) => <select id={id} value={newest ? 'newest' : 'oldest'} onChange={(e) => { change(() => { setNewest(e.target.value === 'newest'); }); }}>
        <option value="newest">{t('dashboard.newest')}</option><option value="oldest">{t('dashboard.oldest')}</option>
      </select>}</Field>
      <Field label={t('dashboard.from')}>{(id) => <input id={id} type="date" value={from} onChange={(e) => { change(() => { setFrom(e.target.value); }); }} />}</Field>
      <Field label={t('dashboard.through')}>{(id) => <input id={id} type="date" value={through} onChange={(e) => { change(() => { setThrough(e.target.value); }); }} />}</Field>
    </div>
    <p>{t(kind === 'invoices' ? 'dashboard.byExpiry' : 'dashboard.byInclusion')}</p>
    {range === undefined ? <p role="alert">{t('dashboard.invalidRange')}</p>
      : count === 0 ? <p role="status">{t('dashboard.empty')}</p>
      : <>
        <ul className="dashboard-records">
          {pageRows.map((row) => <li key={row.id}>
            <strong>{t(STATUS[row.state])}</strong> <bdi>{row.id}</bdi>
            {row.amount !== undefined && <p>{t(kind === 'invoices' ? 'dashboard.expectedAmount' : 'dashboard.observedAmount', { amount: row.amount })} <bdi>{row.asset}</bdi></p>}
            <p>{row.timestamp === undefined ? t('dashboard.timeUnavailable') : t(kind === 'invoices' ? 'dashboard.expires' : 'dashboard.included', { time: date.format(row.timestamp * 1000) })}</p>
            {row.source !== undefined && <p>{t('dashboard.recorded', { time: date.format(row.source) })}</p>}
            {row.state === 'reorged' && row.provenance === 'imported-history' && <p>{t('dashboard.state.imported')}</p>}
            {row.invoiceRefs.length > 0 && <p>{t('dashboard.localAssociations')}{' '}
              {row.invoiceRefs.map((ref, index) => <bdi key={ref}>{index > 0 && ', '}{ref}</bdi>)}
            </p>}
          </li>)}
        </ul>
        <div className="dashboard-actions">
          <button className="btn" type="button" disabled={offset === 0} onClick={() => { setPage(offset / PAGE_SIZE - 1); }}>{t('dashboard.previous')}</button>
          <span role="status">{t('dashboard.page', { first: offset + 1, last: offset + pageRows.length, total: count })}</span>
          <button className="btn" type="button" disabled={offset + PAGE_SIZE >= count} onClick={() => { setPage(offset / PAGE_SIZE + 1); }}>{t('dashboard.next')}</button>
        </div>
      </>}
    {kind === 'invoices' && <section aria-labelledby="dashboard-export-title">
      <h3 id="dashboard-export-title">{t('dashboard.export')}</h3>
      <p>{t('dashboard.exportDisclosure')}</p>
      <Field label={t('dashboard.format')}>{(id) => <select id={id} value={format} onChange={(e) => { change(() => { setFormat(e.target.value === 'json' ? 'json' : 'csv'); }); }}>
        <option value="csv">CSV</option><option value="json">JSON</option>
      </select>}</Field>
      <button ref={previewButton} className="btn" type="button" disabled={invoices.length === 0} onClick={() => {
        try {
          exportRevision.current++;
          setExportError(false);
          const consent = exporter.preview(data.projection, {
            invoiceRefs: invoices.map(({ row }) => row.invoiceRef), columns: EXPORT_COLUMNS, format,
          }, data.context);
          const totals = new Map<string, bigint>();
          for (const { row } of invoices) totals.set(row.assetId, (totals.get(row.assetId) ?? 0n) + BigInt(row.expectedAtomic));
          setPreview({ preview: consent, totals, selectedAt: clock });
        } catch { setPreview(undefined); setExportError(true); }
      }}>{t('dashboard.preview')}</button>
      {preview !== undefined && <div ref={previewControls} className="dashboard-actions">
        <p role="status">{t('dashboard.previewCount', { count: preview.preview.count, format: preview.preview.format.toUpperCase() })}</p>
        <ul>{[...preview.totals].map(([asset, total]) => <li key={asset}>
          <bdi>{asset}</bdi>{' '}{t('dashboard.expectedTotal', { amount: total.toString() })}
        </li>)}</ul>
        <button className="btn" type="button" onClick={() => {
          previewButton.current?.focus();
          setPreview(undefined);
          try {
            const time = Date.now();
            if (expiryChanged(data, status, preview.selectedAt, time)) {
              exporter.cancel();
              setClock(time);
              return;
            }
            const file = exporter.approve(preview.preview, data.context);
            const approval = ++exportRevision.current;
            const current = (): boolean => !data.context.signal.aborted && getSessionPublic() === session && approval === exportRevision.current;
            void (async () => {
              try {
                let released = false;
                await releaseFromCurrentReconciliationState(chain, seller, (latest) => {
                  if (!current()) return;
                  if (expiryChanged(data, status, preview.selectedAt, Date.now()) || ledgerFingerprint(latest) !== data.fingerprint) return;
                  downloadText('ghostpay-invoices.' + preview.preview.format, file.content, file.mimeType);
                  released = true;
                });
                if (!released && current()) load(true);
              } catch {
                if (current()) setExportError(true);
              }
            })();
          } catch { setExportError(true); }
        }}>{t('dashboard.download')}</button>
        <button className="btn" type="button" onClick={() => { exporter.cancel(); previewButton.current?.focus(); setPreview(undefined); }}>{t('dashboard.cancel')}</button>
      </div>}
      {exportError && <p role="alert">{t('dashboard.exportError')}</p>}
    </section>}
  </>;
}

// i18n-use: dashboard.loading dashboard.stale dashboard.error dashboard.locked dashboard.retry dashboard.open dashboard.state.open dashboard.state.expired dashboard.state.late dashboard.state.ambiguous dashboard.state.reorged dashboard.state.historical dashboard.state.imported dashboard.byExpiry dashboard.byInclusion dashboard.expectedAmount dashboard.observedAmount dashboard.expires dashboard.included
