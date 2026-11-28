import { ControlTip } from './ControlTips';
import { findChain, tokensForChain } from '@ghostpay/chain-adapters';
import { createInvoicePaymentSummarizer } from '@ghostpay/ux-vault/portable';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Field, Mono, Notice, downloadText } from './Common';
import { InvoicePaymentSummary } from './InvoicePaymentSummary';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import {
  clearReconciliationRecords,
  exportUntrustedLegacyReconciliation,
  readReconciliationRecords,
  recordFromObservedMatch,
  recordFromVerifiedMatch,
  searchReconciliationRecords,
  type ReconciliationRecord,
} from '../lib/reconciliationLedger';
import { matchesInvoiceEvidence, proposeInvoiceMatch, type MatchProposal, type RegisteredInvoice } from '../lib/reconciliationMatch';
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
import { subscribeAppLock } from '../lib/appLock';
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
  readonly freshLateMatches?: readonly ScanMatch[] | undefined;
  readonly verifyLateEvidence?: ((match: ScanMatch) => Promise<boolean>) | undefined;
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
const AMBIGUITY: Record<'multiple-invoices' | 'multiple-payments' | 'late-observation' | 'missing-block-time', MessageKey> = {
  'multiple-invoices': 'ledger.ambiguity.invoices',
  'multiple-payments': 'ledger.ambiguity.payments',
  'late-observation':
    'ledger.ambiguity.late',
  'missing-block-time': 'ledger.ambiguity.blockTimeMissing',
};
/** Local proposal only: nothing about invoices is published, and a proposal is never payment evidence. */
function ProposalView(props: {
  readonly proposal: MatchProposal | undefined;
  readonly busy: boolean;
  readonly onConfirm: (invoiceDigest: string) => void;
  readonly onAcceptLate?: ((invoiceDigest: string) => void) | undefined;
}): ReactNode {
  const t = useI18nOptional()?.t ?? SOURCE_TRANSLATOR.t;
  const proposal = props.proposal;
  if (proposal === undefined) return null;
  if (proposal.kind === 'none') return <p className="hint">{t('ledger.ui.noRegisteredInvoiceMatchesThisPayment')}</p>;
  if (proposal.kind === 'ambiguous' && proposal.reason === 'late-observation') {
    const invoice = proposal.candidates[0]!;
    return (
      <Notice kind="warn" title={t('ledger.late.verified')}>
        <p>{t('ledger.ambiguity.late')} <Mono>{invoice.invoiceDigest}</Mono></p>
        <p>{t('ledger.late.decision')}</p>
        {props.onAcceptLate === undefined
          ? <p>{t('ledger.late.rescan')}</p>
          : <ControlTip message="ledger.late.decision"><button type="button" className="btn" disabled={props.busy}
              onClick={() => props.onAcceptLate?.(invoice.invoiceDigest)}>{t('ledger.late.accept')}</button></ControlTip>}
      </Notice>
    );
  }
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
      <ControlTip message="tips.matchInvoice"><button
        type="button"
        className="btn"
        disabled={props.busy}
        onClick={() => props.onConfirm(proposal.invoice.invoiceDigest)}
      >{t('ledger.ui.confirmProposedInvoiceMatch')}</button></ControlTip>
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
  readonly onAcceptLate?: ((invoiceDigest: string) => void) | undefined;
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
  const late = props.proposal?.kind === 'ambiguous' && props.proposal.reason === 'late-observation';
  return (
    <div className="ledger-save">
      {!late && <>
      <Field
        label={t('ledger.ui.invoiceDigestOptionalManualLink')}
        hint={t('ledger.ui.yourAnnotationOnlyTheInvoiceIsNotOpenedOrChecked')}
      >
        {(id, describedBy) => (
          <ControlTip message="ledger.ui.yourAnnotationOnlyTheInvoiceIsNotOpenedOrChecked"><input
            id={id}
            aria-describedby={describedBy}
            className="mono"
            dir="ltr"
            autoComplete="off"
            value={invoiceDigest}
            onChange={(event) => setInvoiceDigest(event.target.value)}
            placeholder="0x…"
          /></ControlTip>
        )}
      </Field>
      <ControlTip message="ledger.ui.selectedObservationsAreEncryptedOnThisDeviceWithYourViewing"><button
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
      >{t('ledger.ui.addVerifiedPaymentToLedger')}</button></ControlTip>
      </>}
      <ProposalView
        proposal={props.proposal}
        busy={props.busy}
        onConfirm={props.onConfirm}
        onAcceptLate={props.onAcceptLate}
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
        out.set(match, recordFromObservedMatch(match, keyId, undefined, now));
      } catch {
        /* Non-router or hash-less matches lack a compatible evidence identity. */
      }
    }
    return out;
  }, [props.matches, props.scanMatchesCurrentScope, props.sellerKeyId, props.chainId]);
  const context = useMemo(() => {
    const stored = new Set(records.map((record) => record.id));
    return [...records, ...[...currentRecords.values()].filter((record) => !stored.has(record.id))];
  }, [records, currentRecords]);
  const proposals = useMemo(() => new Map(invoices.length === 0 ? [] :
    context.map((record) => [record.id, proposeInvoiceMatch(record, invoices, context)] as const)
  ), [context, invoices]);
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
    setError(undefined);
  };
  useLayoutEffect(() => {
    mounted.current = true;
    const stopLock = subscribeAppLock(reset);
    const unsubscribe = subscribeSession(() => {
      if (mounted.current) reset();
    });
    return () => {
      mounted.current = false;
      revision.current++;
      vault.current?.lock();
      vault.current = undefined;
      unsubscribe();
      stopLock();
    };
  }, []);
  useLayoutEffect(() => {
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
  const confirmMatch = (record: ReconciliationRecord, invoiceDigest: string, match?: ScanMatch, acceptLate = false): void =>
    run(async (current, guard) => {
      const guardMatches = scanActionGuard(guard, match);
      const fresh = latest.current.freshLateMatches;
      const scanGuard = (): void => {
        guardMatches();
        if (acceptLate && (match === undefined || fresh !== latest.current.freshLateMatches || !fresh?.includes(match)))
          throw new UserFacingError({ key: 'ledger.ui.scanEvidenceIsNoLongerCurrentRescanBeforeSavingOr' });
      };
      scanGuard();
      if (acceptLate && match !== undefined) {
        const verify = latest.current.verifyLateEvidence;
        const valid = await verify?.(match).catch(() => false);
        scanGuard();
        if (valid !== true) {
          await current.quarantineInvoicePayments(BigInt(record.blockNumber), scanGuard);
          const next = await current.readState();
          scanGuard();
          apply(next);
          throw new UserFacingError({ key: 'ledger.late.recheckFailed' });
        }
      }
      await current.confirmProposal(record, invoiceDigest, { current: [...currentRecords.values()], guard: scanGuard, acceptLate });
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
        <ControlTip message="tips.unlockLedger"><button
          type="button"
          className="btn"
          disabled={busy || props.sellerKeyId === undefined}
          onClick={() => run(() => Promise.resolve(), true)}
        >{t('ledger.ui.unlockEncryptedReconciliationVault')}</button></ControlTip>
      ) : (
        <>
          <div className="actions">
            <ControlTip message="tips.lockLedger"><button type="button" className="btn" onClick={reset}>{t('ledger.ui.lockReconciliationVault')}</button></ControlTip>
            <ControlTip message="help.ledgerBackupFile"><button
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
            >{t('ledger.ui.exportEncryptedReconciliationBackup')}</button></ControlTip>
            <ControlTip message="ledger.ui.deleteEncryptedObservationsInThisSellerAndChainScopeReorg"><button
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
            >{t('ledger.ui.deleteEncryptedObservations')}</button></ControlTip>
          </div>
          <Field label={t('ledger.search')}>
            {(id) => (
              <ControlTip message="tips.searchLedger"><input id={id} type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></ControlTip>
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
                  onAcceptLate={props.verifyLateEvidence !== undefined && props.freshLateMatches?.includes(match)
                    ? (digest) => confirmMatch(currentRecords.get(match)!, digest, match, true) : undefined}
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
                        : record.evidenceStatus === 'pending-at-scan'
                          ? t('ledger.late.pending')
                          : record.evidenceStatus === 'unverified-at-scan'
                            ? t('ledger.late.unverified')
                            : t('ledger.ui.routerVerifiedWhenScannedHistoricalObservationNotCurrentPaymentProof')}
                  </p>
                  {record.invoiceDigest !== undefined && (
                    <p>{t('ledger.ui.manualInvoiceLinkOrALocalMatchYouConfirmed')}<Mono>{record.invoiceDigest}</Mono>
                    </p>
                  )}
                  {record.lateAcceptedAt !== undefined && (
                    <p>{t('ledger.late.decisionHistory', { time: new Date(record.lateAcceptedAt).toISOString() })}</p>
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
            context={context}
            proposals={proposals}
            sellerKeyId={props.sellerKeyId}
            chainId={props.chainId}
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
              <ControlTip message="ledger.ui.onlyThisVaultSEncryptedFormatIsAcceptedPlaintextLegacy"><textarea
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
              /></ControlTip>
            )}
          </Field>
          <Field label={t('ledger.ui.encryptedReconciliationBackupFile')} help={{ label: t('help.about', { control: t('ledger.ui.encryptedReconciliationBackupFile') }), text: t('help.ledgerBackupFile') }}>
            {(id, describedBy) => (
              <ControlTip message="help.ledgerBackupFile"><input
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
              /></ControlTip>
            )}
          </Field>
          <ControlTip message="help.ledgerBackupFile"><button
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
          >{t('ledger.ui.previewEncryptedBackup')}</button></ControlTip>
          {preview !== undefined && (
            <div className="panel">
              {preview.readOnly && (
                <Notice kind="warn">{t('ledger.ui.activationWillMakeThisVaultReadOnlyThisBackupOr')}</Notice>
              )}
              <p>
                {t('ledger.import.counts', { records: preview.recordCount, invoices: preview.invoiceCount, receipts: preview.receiptCount })}{' '}
                {t('ledger.import.invalidated', { count: preview.invalidatedCount })}{' '}
                {t('ledger.import.meaning')}</p>
              <ControlTip message="tips.restoreLedger"><button
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
              >{t('ledger.ui.activatePreviewedHistoricalRecords')}</button></ControlTip>
            </div>
          )}
        </>
      )}
      <div className="panel">
        <h4>{t('ledger.legacy.title')}</h4>
        <p className="hint">{t('ledger.ui.legacyDataIsUntrustedAndMayHaveBeenEditedIt')}</p>
        <ControlTip message="ledger.ui.legacyDataIsUntrustedAndMayHaveBeenEditedIt"><button
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
        >{t('ledger.ui.readUntrustedLegacyRecords')}</button></ControlTip>
        <ControlTip message="ledger.ui.exportUntrustedLegacyRecordsAsPlaintextThisRevealsTheStored"><button
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
        >{t('ledger.ui.exportUntrustedLegacyPlaintext')}</button></ControlTip>
        <ControlTip message="ledger.ui.deleteAllLegacyPlaintextReconciliationDataIncludingUnreadableRecords"><button
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
        >{t('ledger.ui.deleteLegacyPlaintextRecords')}</button></ControlTip>
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

function invoiceEvidenceStates(
  invoice: RegisteredInvoice,
  records: readonly (ReconciliationRecord | VaultRecord)[],
  proposals: ReadonlyMap<string, MatchProposal>,
): readonly MessageKey[] {
  const states = new Set<MessageKey>();
  for (const record of records) {
    const linked = record.invoiceDigest === invoice.invoiceDigest;
    if (record.invoiceDigest !== undefined && !linked) continue;
    if (!linked && !matchesInvoiceEvidence(invoice, record)) continue;
    if (record.evidenceStatus === 'invalidated-after-reorg') {
      states.add('ledger.late.invalidated');
    } else if (('provenance' in record && record.provenance === 'imported-history') ||
        record.evidenceStatus === 'unverified-at-scan') {
      states.add('ledger.late.unverified');
    } else if (record.evidenceStatus === 'pending-at-scan') {
      states.add('ledger.late.pending');
    } else if (linked) {
      if (record.blockTimestamp !== undefined && BigInt(record.blockTimestamp) >= BigInt(invoice.expiresAt))
        states.add(record.lateAcceptedAt === undefined ? 'ledger.late.verified' : 'ledger.late.accepted');
      else states.add('ledger.ui.linkedToAVerifiedObservation');
    } else {
      // A proposal speaks only for the invoices it names; one resolved to another invoice says nothing about this one.
      const proposal = proposals.get(record.id);
      if (proposal?.kind === 'exact') {
        if (proposal.invoice.invoiceDigest === invoice.invoiceDigest) states.add('ledger.late.onTime');
      } else if (proposal?.kind === 'ambiguous') {
        if (proposal.candidates.some((candidate) => candidate.invoiceDigest === invoice.invoiceDigest))
          states.add(proposal.reason === 'late-observation' ? 'ledger.late.verified' : 'ledger.late.ambiguous');
      } else states.add('ledger.late.ambiguous');
    }
  }
  return [...states];
}

function InvoiceRegistry(props: {
  readonly invoices: readonly RegisteredInvoice[];
  readonly records: readonly VaultRecord[];
  readonly context: readonly (ReconciliationRecord | VaultRecord)[];
  readonly proposals: ReadonlyMap<string, MatchProposal>;
  readonly sellerKeyId: string | undefined;
  readonly chainId: number;
  readonly busy: boolean;
  readonly onRemove: (digest: string) => void;
  readonly onClear: () => void;
}): ReactNode {
  const t = useI18nOptional()?.t ?? SOURCE_TRANSLATOR.t;
  const summarize = useMemo(() => props.sellerKeyId === undefined ? undefined : createInvoicePaymentSummarizer(
    props.records, { sellerKeyId: props.sellerKeyId, chainId: props.chainId },
  ), [props.records, props.sellerKeyId, props.chainId]);
  return (
    <div className="panel">
      <h4>{t('ledger.invoices.title')}</h4>
      <p className="hint">{t('ledger.ui.invoicesYouChoseToRegisterWhenCreatingThemOnlyThe')}</p>
      {props.invoices.length === 0 ? (
        <p>{t('ledger.invoices.empty')}</p>
      ) : (
        <>
          <ul className="plain-list">
            {props.invoices.map((invoice) => {
              const expired = Date.now() >= invoice.expiresAt * 1000;
              const states = invoiceEvidenceStates(invoice, props.context, props.proposals);
              return (
              <li key={invoice.invoiceDigest} className="card">
                <p>{t('ledger.ui.invoice')}<Mono>{invoice.invoiceDigest}</Mono>
                </p>
                <p className="hint">
                  <bdi dir="ltr">{invoice.expectedNetMinorUnits}</bdi>{t('ledger.ui.baseUnitsOf')}<bdi dir="ltr">{invoice.asset}</bdi>{t('ledger.ui.validUntil')}{' '}
                  {new Date(invoice.expiresAt * 1000).toISOString()}.{' '}
                  {states.length === 0 && t(expired ? 'ledger.late.expired' : 'ledger.ui.noLinkedObservation')}
                </p>
                {states.map((state) => <p key={state}>{t(state)}</p>)}
                {expired && states.some((state) => state !== 'ledger.late.accepted' && state !== 'ledger.ui.linkedToAVerifiedObservation') && (
                  <Notice kind="warn">{t('ledger.late.reissue')}</Notice>
                )}
                {(states.length === 0 || states.includes('ledger.late.accepted') || states.includes('ledger.ui.linkedToAVerifiedObservation')) && (
                  <InvoicePaymentSummary summary={summarize?.(invoice) ?? { kind: 'unavailable' }} />
                )}
                <ControlTip message="ledger.ui.removeThisInvoiceRegistrationSavedObservationsAndLinksAreKept"><button
                  type="button"
                  className="btn"
                  disabled={props.busy}
                  onClick={() => {
                    if (window.confirm(t('ledger.ui.removeThisInvoiceRegistrationSavedObservationsAndLinksAreKept')))
                      props.onRemove(invoice.invoiceDigest);
                  }}
                >{t('ledger.ui.removeRegistration')}</button></ControlTip>
              </li>
              );
            })}
          </ul>
          <ControlTip message="ledger.ui.removeAllInvoiceRegistrationsInThisSellerAndChainScope"><button
            type="button"
            className="btn btn-danger"
            disabled={props.busy}
            onClick={() => {
              if (window.confirm(t('ledger.ui.removeAllInvoiceRegistrationsInThisSellerAndChainScope'))) props.onClear();
            }}
          >{t('ledger.ui.removeAllInvoiceRegistrations')}</button></ControlTip>
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
                <ControlTip message="ledger.ui.deleteThisArchivedReceiptFromThisDevice"><button
                  type="button"
                  className="btn"
                  disabled={props.busy}
                  onClick={() => {
                    if (window.confirm(t('ledger.ui.deleteThisArchivedReceiptFromThisDevice')))
                      props.onRemove(receipt.signature);
                  }}
                >{t('ledger.ui.deleteArchivedReceipt')}</button></ControlTip>
              </li>
            ))}
          </ul>
          <div className="actions">
            <ControlTip message="ledger.ui.exportArchivedReceiptsAsPlaintextJSONTheFileRevealsPayment"><button
              type="button"
              className="btn"
              disabled={props.busy}
              onClick={() => {
                if (window.confirm(t('ledger.ui.exportArchivedReceiptsAsPlaintextJSONTheFileRevealsPayment')))
                  props.onExport();
              }}
            >{t('ledger.ui.exportArchivedReceipts')}</button></ControlTip>
            <ControlTip message="ledger.ui.deleteAllArchivedReceiptsInThisSellerAndChainScope"><button
              type="button"
              className="btn btn-danger"
              disabled={props.busy}
              onClick={() => {
                if (window.confirm(t('ledger.ui.deleteAllArchivedReceiptsInThisSellerAndChainScope'))) props.onClear();
              }}
            >{t('ledger.ui.deleteAllArchivedReceipts')}</button></ControlTip>
          </div>
        </>
      )}
    </div>
  );
}

// i18n-use: ledger.ambiguity.invoices ledger.ambiguity.payments ledger.ambiguity.late ledger.ambiguity.blockTimeMissing
