import { findChain, tokensForChain } from '@ghostpay/chain-adapters';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Field, Mono, Notice, downloadText } from './Common';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import {
  clearReconciliationRecords,
  exportUntrustedLegacyReconciliation,
  readReconciliationRecords,
  recordFromVerifiedMatch,
  searchReconciliationRecords,
  type ReconciliationRecord,
} from '../lib/reconciliationLedger';
import { proposeInvoiceMatch, type MatchProposal, type RegisteredInvoice } from '../lib/reconciliationMatch';
import {
  createCurrentReconciliationVault,
  MAX_VAULT_BYTES,
  type ArchivedReceipt,
  type ReconciliationState,
  subscribeReconciliationChanges,
  type ReconciliationImportPreview,
  type ReconciliationVault,
  type VaultRecord,
} from '../lib/reconciliationVault';
import { getSessionPublic, subscribeSession } from '../lib/session';
import type { ScanMatch } from '../lib/scanClient';
import { formatUnits } from '../lib/format';
import { UserFacingError, userMessage } from '../lib/errors';
import type { MessageKey } from '../i18n/catalog';
import type { Translator } from '../i18n/translator';

function publicLedgerError(error: unknown): UserFacingError {
  return error instanceof UserFacingError ? error : new UserFacingError({ key: 'ledger.error.actionFailed' });
}

export interface ReconciliationLedgerProps {
  readonly chainId: number;
  readonly sellerKeyId: string | undefined;
  readonly matches: readonly ScanMatch[];
  readonly scanMatchesCurrentScope: boolean;
  readonly onAnnounce?: (message: string) => void;
}
function assetLabel(record: ReconciliationRecord, t: Translator['t']): string {
  if (record.asset === 'native')
    return `${formatUnits(BigInt(record.amountMinorUnits), 18)} ${findChain(record.chainId)?.nativeSymbol ?? t('ledger.asset.native')}`;
  const token = tokensForChain(record.chainId).find((item) => item.address.toLowerCase() === record.asset);
  return token === undefined
    ? t('ledger.asset.baseUnits', { amount: record.amountMinorUnits, asset: record.asset })
    : `${formatUnits(BigInt(record.amountMinorUnits), token.decimals)} ${token.symbol}`;
}
const AMBIGUITY: Record<'multiple-invoices' | 'multiple-payments' | 'late-observation', MessageKey> = {
  'multiple-invoices': 'ledger.ambiguity.invoices',
  'multiple-payments': 'ledger.ambiguity.payments',
  'late-observation':
    'ledger.ambiguity.late',
};
/** Local proposal only: nothing about invoices is published, and a proposal is never payment evidence. */
function ProposalView(props: {
  readonly proposal: MatchProposal | undefined;
  readonly busy: boolean;
  readonly onConfirm: (invoiceDigest: string) => void;
}): ReactNode {
  const t = useI18nOptional()?.t ?? SOURCE_TRANSLATOR.t;
  const proposal = props.proposal;
  if (proposal === undefined) return null;
  if (proposal.kind === 'none') return <p className="hint">{t('ledger.ui.noRegisteredInvoiceMatchesThisPayment')}</p>;
  if (proposal.kind === 'ambiguous')
    return (
      <Notice kind="warn" title={t('ledger.ui.ambiguousInvoiceMatchNotConfirmed')}>
        {t(AMBIGUITY[proposal.reason])}{t('ledger.ui.ambiguousMatchesAreNeverConfirmedAutomaticallyCandidates')}{' '}
        {proposal.candidates.map((c, i) => (
          <span key={c.invoiceDigest}>
            {i > 0 && ', '}
            <Mono>{c.invoiceDigest}</Mono>
          </span>
        ))}{t('ledger.ui.linkOneManuallyOnlyIfYouKnowWhichInvoiceWas')}</Notice>
    );
  return (
    <div className="ledger-proposal">
      <p>{t('ledger.ui.exactLocalMatchProposedInvoice')}<Mono>{proposal.invoice.invoiceDigest}</Mono>{t('ledger.ui.sameChainAssetAndRouterNetAmountObservedWithinIts')}</p>
      <button
        type="button"
        className="btn"
        disabled={props.busy}
        onClick={() => props.onConfirm(proposal.invoice.invoiceDigest)}
      >{t('ledger.ui.confirmProposedInvoiceMatch')}</button>
    </div>
  );
}
function MatchLedgerAction(props: {
  readonly match: ScanMatch;
  readonly sellerKeyId: string;
  readonly onSave: (record: ReconciliationRecord) => void;
  readonly busy: boolean;
  readonly onError: (error: UserFacingError) => void;
  readonly proposal: MatchProposal | undefined;
  readonly onConfirm: (invoiceDigest: string) => void;
}): ReactNode {
  const t = useI18nOptional()?.t ?? SOURCE_TRANSLATOR.t;
  const [invoiceDigest, setInvoiceDigest] = useState('');
  const match = props.match;
  if (
    match.receipt !== 'verified' ||
    !match.viaRouter ||
    match.metadata === undefined ||
    match.announcement.transactionHash === undefined
  )
    return null;
  return (
    <div className="ledger-save">
      <Field
        label={t('ledger.ui.invoiceDigestOptionalManualLink')}
        hint={t('ledger.ui.yourAnnotationOnlyTheInvoiceIsNotOpenedOrChecked')}
      >
        {(id, describedBy) => (
          <input
            id={id}
            aria-describedby={describedBy}
            className="mono"
            dir="ltr"
            autoComplete="off"
            value={invoiceDigest}
            onChange={(event) => setInvoiceDigest(event.target.value)}
            placeholder="0x…"
          />
        )}
      </Field>
      <button
        type="button"
        className="btn"
        disabled={props.busy}
        onClick={() => {
          try {
            const digest = invoiceDigest.trim().toLowerCase();
            props.onSave(
              recordFromVerifiedMatch(match, props.sellerKeyId, digest === '' ? undefined : digest),
            );
          } catch (error) {
            props.onError(publicLedgerError(error));
          }
        }}
      >{t('ledger.ui.addVerifiedPaymentToLedger')}</button>
      <ProposalView
        proposal={props.proposal}
        busy={props.busy}
        onConfirm={props.onConfirm}
      />
    </div>
  );
}
export function ReconciliationLedger(props: ReconciliationLedgerProps): ReactNode {
  const i18n = useI18nOptional();
  const t = i18n?.t ?? SOURCE_TRANSLATOR.t;
  const latestT = useRef(t);
  latestT.current = t;
  const [records, setRecords] = useState<readonly VaultRecord[]>([]);
  const [invoices, setInvoices] = useState<readonly RegisteredInvoice[]>([]);
  const [receipts, setReceipts] = useState<readonly ArchivedReceipt[]>([]);
  const [legacy, setLegacy] = useState<readonly ReconciliationRecord[] | undefined>(undefined);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<UserFacingError | undefined>();
  const [unlocked, setUnlocked] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [backup, setBackup] = useState('');
  const [preview, setPreview] = useState<ReconciliationImportPreview | undefined>();
  const vault = useRef<ReconciliationVault | undefined>(undefined);
  const revision = useRef(0);
  const mounted = useRef(true);
  const pending = useRef(false);
  const backupRevision = useRef(0);
  const readRevision = useRef(0);
  const latest = useRef(props);
  latest.current = props;
  const visible = useMemo(
    () => searchReconciliationRecords(records, query),
    [records, query],
  );
  const currentRecords = useMemo(() => {
    const out = new Map<ScanMatch, ReconciliationRecord>();
    const keyId = props.sellerKeyId;
    if (!props.scanMatchesCurrentScope || keyId === undefined) return out;
    const now = Date.now();
    for (const match of props.matches) {
      if (match.chainId !== props.chainId) continue;
      try {
        out.set(match, recordFromVerifiedMatch(match, keyId, undefined, now));
      } catch {
        /* Unverified, claimed or hash-less matches are never proposed. */
      }
    }
    return out;
  }, [props.matches, props.scanMatchesCurrentScope, props.sellerKeyId, props.chainId]);
  const proposals = useMemo(() => {
    const result = new Map<string, MatchProposal>();
    if (invoices.length === 0) return result;
    const stored = new Set(records.map((r) => r.id));
    const context = [...records, ...[...currentRecords.values()].filter((r) => !stored.has(r.id))];
    for (const record of context) result.set(record.id, proposeInvoiceMatch(record, invoices, context));
    return result;
  }, [records, invoices, currentRecords]);
  const proposalFor = (record: ReconciliationRecord | undefined): MatchProposal | undefined => {
    if (record === undefined) return undefined;
    const stored = records.find((r) => r.id === record.id);
    // Stored records that are linked, invalidated or imported show their own status instead.
    if (
      stored !== undefined &&
      (stored.invoiceDigest !== undefined ||
        stored.provenance !== 'live-scan' ||
        stored.evidenceStatus !== 'verified-at-scan')
    )
      return undefined;
    return proposals.get(record.id);
  };
  const apply = (next: ReconciliationState): void => {
    setRecords(next.records);
    setReadOnly(next.readOnly);
    setInvoices(next.invoices);
    setReceipts(next.receipts);
  };
  const reset = (): void => {
    revision.current++;
    backupRevision.current++;
    readRevision.current++;
    vault.current?.lock();
    vault.current = undefined;
    pending.current = false;
    setUnlocked(false);
    setReadOnly(false);
    setBusy(false);
    setRecords([]);
    setInvoices([]);
    setReceipts([]);
    setLegacy(undefined);
    setPreview(undefined);
    setBackup('');
    setQuery('');
  };
  useEffect(() => {
    mounted.current = true;
    const unsubscribe = subscribeSession(() => {
      if (mounted.current) reset();
    });
    return () => {
      mounted.current = false;
      revision.current++;
      vault.current?.lock();
      vault.current = undefined;
      unsubscribe();
    };
  }, []);
  useEffect(() => {
    reset();
  }, [props.chainId, props.sellerKeyId]);
  useEffect(() => {
    const refresh = (): void => {
      const current = vault.current;
      if (current === undefined) return;
      const actionRevision = revision.current;
      const refreshId = ++readRevision.current;
      void current.readState().then(
        (next) => {
          if (
            mounted.current &&
            revision.current === actionRevision &&
            readRevision.current === refreshId &&
            vault.current === current
          ) {
            apply(next);
          }
        },
        () => {
          if (mounted.current && revision.current === actionRevision && readRevision.current === refreshId) {
            apply({ records: [], readOnly: true, invoices: [], receipts: [] });
            setError(
              new UserFacingError({ key: 'ledger.ui.encryptedReconciliationDataCouldNotBeRefreshedLockAndUnlock' }),
            );
          }
        },
      );
    };
    return subscribeReconciliationChanges(refresh);
  }, []);
  const run = (
    action: (current: ReconciliationVault, guard: () => void) => Promise<void>,
    unlock = false,
  ): void => {
    if (pending.current || props.sellerKeyId === undefined) return;
    const actionRevision = revision.current;
    const scope = { chainId: props.chainId, sellerKeyId: props.sellerKeyId };
    const session = getSessionPublic();
    const guard = (): void => {
      if (
        !mounted.current ||
        revision.current !== actionRevision ||
        latest.current.chainId !== scope.chainId ||
        latest.current.sellerKeyId !== scope.sellerKeyId ||
        getSessionPublic() !== session
      )
        throw new UserFacingError({ key: 'ledger.ui.reconciliationActionBecameStale' });
    };
    pending.current = true;
    setBusy(true);
    setError(undefined);
    void (async () => {
      let current: ReconciliationVault | undefined;
      let readGeneration: number | undefined;
      try {
        current = vault.current;
        if (current === undefined) {
          if (!unlock) return;
          current = await createCurrentReconciliationVault(scope.chainId, scope.sellerKeyId);
          guard();
          vault.current = current;
        }
        guard();
        await action(current, guard);
        guard();
        readGeneration = ++readRevision.current;
        const next = await current.readState();
        guard();
        if (readGeneration === readRevision.current) apply(next);
        setUnlocked(true);
      } catch (cause) {
        if (readGeneration !== undefined && readGeneration !== readRevision.current) return;
        try {
          guard();
          setError(publicLedgerError(cause));
        } catch {
          if (current !== vault.current) current?.lock();
        }
      } finally {
        if (mounted.current && revision.current === actionRevision) {
          pending.current = false;
          setBusy(false);
        }
      }
    })();
  };
  // A scan can change while the vault encrypts. Recheck its identity inside the storage transaction too.
  const scanActionGuard = (guard: () => void, match?: ScanMatch): (() => void) => {
    const scanMatches = latest.current.matches;
    const scanCurrent = latest.current.scanMatchesCurrentScope;
    return () => {
      guard();
      if (
        latest.current.matches !== scanMatches ||
        latest.current.scanMatchesCurrentScope !== scanCurrent ||
        (match !== undefined && (!scanCurrent || !scanMatches.includes(match)))
      )
        throw new UserFacingError({ key: 'ledger.ui.scanEvidenceIsNoLongerCurrentRescanBeforeSavingOr' });
    };
  };
  const confirmMatch = (record: ReconciliationRecord, invoiceDigest: string, match?: ScanMatch): void =>
    run(async (current, guard) => {
      const scanGuard = scanActionGuard(guard, match);
      scanGuard();
      await current.confirmProposal(record, invoiceDigest, { current: [...currentRecords.values()], guard: scanGuard });
      guard();
      props.onAnnounce?.(latestT.current('ledger.ui.invoiceMatchConfirmedInTheEncryptedReconciliationVault'));
    });
  return (
    <section className="panel reconciliation-ledger" aria-labelledby="ledger-heading">
      <h3 id="ledger-heading">{t('ledger.title')}</h3>
      <p className="hint">{t('ledger.ui.selectedObservationsAreEncryptedOnThisDeviceWithYourViewing')}</p>
      <p className="hint">{t('ledger.ui.invalidationHistoryIsBoundedIfItReachesCapacityTheEncrypted')}</p>
      {unlocked && readOnly && (
        <Notice kind="warn">{t('ledger.ui.thisReconciliationVaultIsReadOnlyBecauseInvalidationHistoryReached')}</Notice>
      )}
      {error !== undefined && <Notice kind="error">{userMessage(error, t)}</Notice>}
      {!unlocked ? (
        <button
          type="button"
          className="btn"
          disabled={busy || props.sellerKeyId === undefined}
          onClick={() => run(() => Promise.resolve(), true)}
        >{t('ledger.ui.unlockEncryptedReconciliationVault')}</button>
      ) : (
        <>
          <div className="actions">
            <button type="button" className="btn" onClick={reset}>{t('ledger.ui.lockReconciliationVault')}</button>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() =>
                run(async (current, guard) => {
                  const encrypted = await current.exportEncrypted();
                  guard();
                  downloadText('ghostpay-reconciliation-encrypted.json', encrypted, 'application/json');
                })
              }
            >{t('ledger.ui.exportEncryptedReconciliationBackup')}</button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    t('ledger.ui.deleteEncryptedObservationsInThisSellerAndChainScopeReorg'),
                  )
                )
                  run(async (current) => current.clearRecords());
              }}
            >{t('ledger.ui.deleteEncryptedObservations')}</button>
          </div>
          <Field label={t('ledger.search')}>
            {(id) => (
              <input id={id} type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
            )}
          </Field>
          <p className="hint">{t('ledger.recordCount', { count: records.length })}</p>
          {props.scanMatchesCurrentScope &&
            props.sellerKeyId !== undefined &&
            props.matches
              .filter((match) => match.chainId === props.chainId)
              .map((match) => (
                <MatchLedgerAction
                  key={`${match.chainId}:${match.announcement.id}:${match.announcement.blockHash}`}
                  match={match}
                  sellerKeyId={props.sellerKeyId!}
                  busy={busy || readOnly}
                  onError={setError}
                  proposal={proposalFor(currentRecords.get(match))}
                  // A proposal is shown only for a match that produced a current record.
                  onConfirm={(digest) => confirmMatch(currentRecords.get(match)!, digest, match)}
                  onSave={(record) =>
                    run(async (current, guard) => {
                      const scanGuard = scanActionGuard(guard, match);
                      scanGuard();
                      await current.save(record, scanGuard);
                      guard();
                      props.onAnnounce?.(latestT.current('ledger.ui.observationSavedInTheEncryptedReconciliationVault'));
                    })
                  }
                />
              ))}
          {!props.scanMatchesCurrentScope && (
            <p className="hint">{t('ledger.ui.runAScanInTheCurrentSellerAndChainSession')}</p>
          )}
          {visible.length === 0 ? (
            <p>{t('ledger.empty')}</p>
          ) : (
            <ul className="plain-list">
              {visible.map((record) => (
                <li key={record.id} className="card">
                  <strong>
                    {findChain(record.chainId)?.name ?? t('ledger.chain', { chain: String(record.chainId) })} · <bdi dir="ltr">{assetLabel(record, t)}</bdi>
                  </strong>
                  <p>
                    {record.evidenceStatus === 'invalidated-after-reorg'
                      ? t('ledger.ui.invalidatedAfterAReorgDoNotRelyOnThisObservation')
                      : record.provenance === 'imported-history'
                        ? t('ledger.ui.importedHistoricalObservationUntrustedUntilIndependentlyRescanned')
                        : t('ledger.ui.routerVerifiedWhenScannedHistoricalObservationNotCurrentPaymentProof')}
                  </p>
                  {record.invoiceDigest !== undefined && (
                    <p>{t('ledger.ui.manualInvoiceLinkOrALocalMatchYouConfirmed')}<Mono>{record.invoiceDigest}</Mono>
                    </p>
                  )}
                  <ProposalView
                    proposal={proposalFor(record)}
                    busy={busy || readOnly}
                    onConfirm={(digest) => confirmMatch(record, digest)}
                  />
                  <p>{t('ledger.ui.transaction')}<Mono>{record.transactionHash}</Mono>
                  </p>
                  <p>{t('ledger.ui.recipient')}<Mono>{record.stealthAddress}</Mono>
                  </p>
                  <p className="hint">{t('ledger.ui.block')}{record.blockNumber}{t('ledger.ui.log')}{record.logIndex}{t('ledger.ui.recorded')}{' '}
                    {new Date(record.recordedAt).toISOString()}.
                  </p>
                </li>
              ))}
            </ul>
          )}
          <InvoiceRegistry
            invoices={invoices}
            records={records}
            busy={busy}
            onRemove={(digest) => run(async (current) => current.removeInvoice(digest))}
            onClear={() => run(async (current) => current.clearInvoices())}
          />
          <ReceiptArchive
            receipts={receipts}
            busy={busy}
            onExport={() =>
              run(async (current, guard) => {
                const text = await current.exportReceipts();
                guard();
                downloadText('ghostpay-receipts.json', text, 'application/json');
              })
            }
            onRemove={(signature) => run(async (current) => current.removeReceipt(signature))}
            onClear={() => run(async (current) => current.clearReceipts())}
          />
          <Field
            label={t('ledger.ui.encryptedReconciliationBackup')}
            hint={t('ledger.ui.onlyThisVaultSEncryptedFormatIsAcceptedPlaintextLegacy')}
          >
            {(id, describedBy) => (
              <textarea
                id={id}
                aria-describedby={describedBy}
                rows={3}
                dir="ltr"
                maxLength={MAX_VAULT_BYTES}
                value={backup}
                onChange={(event) => {
                  backupRevision.current++;
                  setBackup(event.target.value);
                  setPreview(undefined);
                }}
              />
            )}
          </Field>
          <Field label={t('ledger.ui.encryptedReconciliationBackupFile')} help={{ label: t('help.about', { control: t('ledger.ui.encryptedReconciliationBackupFile') }), text: t('help.ledgerBackupFile') }}>
            {(id, describedBy) => (
              <input
                id={id}
                aria-describedby={describedBy}
                type="file"
                accept="application/json,.json"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  const backupId = ++backupRevision.current;
                  setPreview(undefined);
                  if (file === undefined) return;
                  if (file.size > MAX_VAULT_BYTES) {
                    setError(new UserFacingError({ key: 'ledger.ui.encryptedReconciliationBackupExceedsItsSafetyLimit' }));
                    return;
                  }
                  const actionRevision = revision.current;
                  void file.text().then(
                    (text) => {
                      if (
                        mounted.current &&
                        revision.current === actionRevision &&
                        backupRevision.current === backupId
                      )
                        setBackup(text);
                    },
                    () => {
                      if (
                        mounted.current &&
                        revision.current === actionRevision &&
                        backupRevision.current === backupId
                      )
                        setError(new UserFacingError({ key: 'ledger.ui.theEncryptedBackupFileCouldNotBeRead' }));
                    },
                  );
                }}
              />
            )}
          </Field>
          <button
            type="button"
            className="btn"
            disabled={busy || backup === ''}
            onClick={() => {
              const text = backup;
              const backupId = backupRevision.current;
              run(async (current, guard) => {
                const staged = await current.previewImport(text);
                guard();
                if (backupRevision.current === backupId) setPreview(staged);
              });
            }}
          >{t('ledger.ui.previewEncryptedBackup')}</button>
          {preview !== undefined && (
            <div className="panel">
              {preview.readOnly && (
                <Notice kind="warn">{t('ledger.ui.activationWillMakeThisVaultReadOnlyThisBackupOr')}</Notice>
              )}
              <p>
                {t('ledger.import.counts', { records: preview.recordCount, invoices: preview.invoiceCount, receipts: preview.receiptCount })}{' '}
                {t('ledger.import.invalidated', { count: preview.invalidatedCount })}{' '}
                {t('ledger.import.meaning')}</p>
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() =>
                  run(async (current, guard) => {
                    await current.activateImport(preview);
                    guard();
                    setPreview(undefined);
                    setBackup('');
                  })
                }
              >{t('ledger.ui.activatePreviewedHistoricalRecords')}</button>
            </div>
          )}
        </>
      )}
      <div className="panel">
        <h4>{t('ledger.legacy.title')}</h4>
        <p className="hint">{t('ledger.ui.legacyDataIsUntrustedAndMayHaveBeenEditedIt')}</p>
        <button
          type="button"
          className="btn"
          onClick={() => {
            try {
              setLegacy(readReconciliationRecords());
              setError(undefined);
            } catch (cause) {
              setError(publicLedgerError(cause));
            }
          }}
        >{t('ledger.ui.readUntrustedLegacyRecords')}</button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            if (
              !window.confirm(
                t('ledger.ui.exportUntrustedLegacyRecordsAsPlaintextThisRevealsTheStored'),
              )
            )
              return;
            try {
              downloadText(
                'ghostpay-untrusted-legacy-ledger.txt',
                exportUntrustedLegacyReconciliation(),
                'text/plain',
              );
            } catch (cause) {
              setError(publicLedgerError(cause));
            }
          }}
        >{t('ledger.ui.exportUntrustedLegacyPlaintext')}</button>
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => {
            if (
              !window.confirm(
                t('ledger.ui.deleteAllLegacyPlaintextReconciliationDataIncludingUnreadableRecords'),
              )
            )
              return;
            try {
              clearReconciliationRecords();
              setLegacy(undefined);
              setError(undefined);
            } catch {
              setError(new UserFacingError({ key: 'ledger.ui.legacyPlaintextDataCouldNotBeDeleted' }));
            }
          }}
        >{t('ledger.ui.deleteLegacyPlaintextRecords')}</button>
        {legacy !== undefined && (
          <ul>
            {legacy.map((record) => (
              <li key={record.id}>{t('ledger.ui.untrustedLegacyTransaction')}<Mono>{record.transactionHash}</Mono>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function InvoiceRegistry(props: {
  readonly invoices: readonly RegisteredInvoice[];
  readonly records: readonly VaultRecord[];
  readonly busy: boolean;
  readonly onRemove: (digest: string) => void;
  readonly onClear: () => void;
}): ReactNode {
  const t = useI18nOptional()?.t ?? SOURCE_TRANSLATOR.t;
  const linked = new Set(
    props.records
      .filter((r) => r.evidenceStatus === 'verified-at-scan' && r.invoiceDigest !== undefined)
      .map((r) => r.invoiceDigest),
  );
  return (
    <div className="panel">
      <h4>{t('ledger.invoices.title')}</h4>
      <p className="hint">{t('ledger.ui.invoicesYouChoseToRegisterWhenCreatingThemOnlyThe')}</p>
      {props.invoices.length === 0 ? (
        <p>{t('ledger.invoices.empty')}</p>
      ) : (
        <>
          <ul className="plain-list">
            {props.invoices.map((invoice) => (
              <li key={invoice.invoiceDigest} className="card">
                <p>{t('ledger.ui.invoice')}<Mono>{invoice.invoiceDigest}</Mono>
                </p>
                <p className="hint">
                  <bdi dir="ltr">{invoice.expectedNetMinorUnits}</bdi>{t('ledger.ui.baseUnitsOf')}<bdi dir="ltr">{invoice.asset}</bdi>{t('ledger.ui.validUntil')}{' '}
                  {new Date(invoice.expiresAt * 1000).toISOString()}.{' '}
                  {linked.has(invoice.invoiceDigest) ? t('ledger.ui.linkedToAVerifiedObservation') : t('ledger.ui.noLinkedObservation')}
                </p>
                <button
                  type="button"
                  className="btn"
                  disabled={props.busy}
                  onClick={() => {
                    if (window.confirm(t('ledger.ui.removeThisInvoiceRegistrationSavedObservationsAndLinksAreKept')))
                      props.onRemove(invoice.invoiceDigest);
                  }}
                >{t('ledger.ui.removeRegistration')}</button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="btn btn-danger"
            disabled={props.busy}
            onClick={() => {
              if (window.confirm(t('ledger.ui.removeAllInvoiceRegistrationsInThisSellerAndChainScope'))) props.onClear();
            }}
          >{t('ledger.ui.removeAllInvoiceRegistrations')}</button>
        </>
      )}
    </div>
  );
}

function ReceiptArchive(props: {
  readonly receipts: readonly ArchivedReceipt[];
  readonly busy: boolean;
  readonly onExport: () => void;
  readonly onRemove: (signature: string) => void;
  readonly onClear: () => void;
}): ReactNode {
  const t = useI18nOptional()?.t ?? SOURCE_TRANSLATOR.t;
  return (
    <div className="panel">
      <h4>{t('ledger.receipts.title')}</h4>
      <p className="hint">{t('ledger.ui.receiptsYouIssuedStoredEncryptedUntilYouDeleteThemOr')}</p>
      {props.receipts.length === 0 ? (
        <p>{t('ledger.receipts.empty')}</p>
      ) : (
        <>
          <ul className="plain-list">
            {props.receipts.map(({ receipt, archivedAt }) => (
              <li key={receipt.signature} className="card">
                <p>{t('ledger.ui.transaction2')}<Mono>{receipt.txHash}</Mono>{t('ledger.ui.forInvoice')}<Mono>{receipt.invoiceDigest}</Mono>
                </p>
                <p className="hint">
                  <bdi dir="ltr">{receipt.amountMinorUnits}</bdi>{t('ledger.ui.baseUnitsOf')}<bdi dir="ltr">{receipt.asset}</bdi>{t('ledger.ui.issued')}{' '}
                  {new Date(receipt.issuedAt * 1000).toISOString()}{t('ledger.ui.archived')}{new Date(archivedAt).toISOString()}.
                </p>
                <button
                  type="button"
                  className="btn"
                  disabled={props.busy}
                  onClick={() => {
                    if (window.confirm(t('ledger.ui.deleteThisArchivedReceiptFromThisDevice')))
                      props.onRemove(receipt.signature);
                  }}
                >{t('ledger.ui.deleteArchivedReceipt')}</button>
              </li>
            ))}
          </ul>
          <div className="actions">
            <button
              type="button"
              className="btn"
              disabled={props.busy}
              onClick={() => {
                if (window.confirm(t('ledger.ui.exportArchivedReceiptsAsPlaintextJSONTheFileRevealsPayment')))
                  props.onExport();
              }}
            >{t('ledger.ui.exportArchivedReceipts')}</button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={props.busy}
              onClick={() => {
                if (window.confirm(t('ledger.ui.deleteAllArchivedReceiptsInThisSellerAndChainScope'))) props.onClear();
              }}
            >{t('ledger.ui.deleteAllArchivedReceipts')}</button>
          </div>
        </>
      )}
    </div>
  );
}

// i18n-use: ledger.ambiguity.invoices ledger.ambiguity.payments ledger.ambiguity.late
