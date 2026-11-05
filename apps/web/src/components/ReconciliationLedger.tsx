import { findChain, tokensForChain } from '@ghostpay/chain-adapters';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Field, Mono, Notice, downloadText } from './Common';
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

export interface ReconciliationLedgerProps {
  readonly chainId: number;
  readonly sellerKeyId: string | undefined;
  readonly matches: readonly ScanMatch[];
  readonly scanMatchesCurrentScope: boolean;
  readonly onAnnounce?: (message: string) => void;
}
function assetLabel(record: ReconciliationRecord): string {
  if (record.asset === 'native')
    return `${formatUnits(BigInt(record.amountMinorUnits), 18)} ${findChain(record.chainId)?.nativeSymbol ?? 'native'}`;
  const token = tokensForChain(record.chainId).find((item) => item.address.toLowerCase() === record.asset);
  return token === undefined
    ? `${record.amountMinorUnits} base units of ${record.asset}`
    : `${formatUnits(BigInt(record.amountMinorUnits), token.decimals)} ${token.symbol}`;
}
const AMBIGUITY: Record<'multiple-invoices' | 'multiple-payments' | 'late-observation', string> = {
  'multiple-invoices': 'Several registered invoices have this chain, asset and amount.',
  'multiple-payments': 'Several unlinked payments match the same registered invoice.',
  'late-observation':
    'This payment was first observed long after the invoice expired, so its payment time is unknown.',
};
/** Local proposal only: nothing about invoices is published, and a proposal is never payment evidence. */
function ProposalView(props: {
  readonly proposal: MatchProposal | undefined;
  readonly busy: boolean;
  readonly onConfirm: (invoiceDigest: string) => void;
}): ReactNode {
  const proposal = props.proposal;
  if (proposal === undefined) return null;
  if (proposal.kind === 'none') return <p className="hint">No registered invoice matches this payment.</p>;
  if (proposal.kind === 'ambiguous')
    return (
      <Notice kind="warn" title="Ambiguous invoice match (not confirmed)">
        {AMBIGUITY[proposal.reason]} Ambiguous matches are never confirmed automatically. Candidates:{' '}
        {proposal.candidates.map((c, i) => (
          <span key={c.invoiceDigest}>
            {i > 0 && ', '}
            <Mono>{c.invoiceDigest}</Mono>
          </span>
        ))}
        . Link one manually only if you know which invoice was paid.
      </Notice>
    );
  return (
    <div className="ledger-proposal">
      <p>
        Exact local match proposed: invoice <Mono>{proposal.invoice.invoiceDigest}</Mono> (same chain, asset and
        router net amount, observed within its time window). This is a local inference, not payment proof.
      </p>
      <button
        type="button"
        className="btn"
        disabled={props.busy}
        onClick={() => props.onConfirm(proposal.invoice.invoiceDigest)}
      >
        Confirm proposed invoice match
      </button>
    </div>
  );
}
function MatchLedgerAction(props: {
  readonly match: ScanMatch;
  readonly sellerKeyId: string;
  readonly onSave: (record: ReconciliationRecord) => void;
  readonly busy: boolean;
  readonly onError: (message: string) => void;
  readonly proposal: MatchProposal | undefined;
  readonly onConfirm: (invoiceDigest: string) => void;
}): ReactNode {
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
        label="Invoice digest (optional, manual link)"
        hint="Your annotation only. The invoice is not opened or checked and this link does not prove payment."
      >
        {(id, describedBy) => (
          <input
            id={id}
            aria-describedby={describedBy}
            className="mono"
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
            props.onError(error instanceof Error ? error.message : 'The observation could not be saved.');
          }
        }}
      >
        Add verified payment to ledger
      </button>
      <ProposalView
        proposal={props.proposal}
        busy={props.busy}
        onConfirm={props.onConfirm}
      />
    </div>
  );
}
export function ReconciliationLedger(props: ReconciliationLedgerProps): ReactNode {
  const [records, setRecords] = useState<readonly VaultRecord[]>([]);
  const [invoices, setInvoices] = useState<readonly RegisteredInvoice[]>([]);
  const [receipts, setReceipts] = useState<readonly ArchivedReceipt[]>([]);
  const [legacy, setLegacy] = useState<readonly ReconciliationRecord[] | undefined>(undefined);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | undefined>();
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
    () => searchReconciliationRecords(records, query) as readonly VaultRecord[],
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
              'Encrypted reconciliation data could not be refreshed. Lock and unlock before relying on it.',
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
        throw new Error('Reconciliation action became stale.');
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
          setError(cause instanceof Error ? cause.message : 'Encrypted reconciliation action failed.');
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
  const confirmMatch = (record: ReconciliationRecord, invoiceDigest: string, match?: ScanMatch): void =>
    run(async (current, guard) => {
      guard();
      if (
        match !== undefined &&
        (!latest.current.scanMatchesCurrentScope || !latest.current.matches.includes(match))
      )
        throw new Error('Scan evidence is no longer current. Rescan before confirming.');
      await current.confirmProposal(record, invoiceDigest);
      guard();
      props.onAnnounce?.('Invoice match confirmed in the encrypted reconciliation vault.');
    });
  return (
    <section className="panel reconciliation-ledger" aria-labelledby="ledger-heading">
      <h3 id="ledger-heading">Local payment reconciliation</h3>
      <p className="hint">
        Selected observations are encrypted on this device with your viewing key. The public seller-key
        identifier, chain and ciphertext size remain visible. Keep an encrypted backup and your seller
        keystore; losing the seller keys loses access. Unlocked data is visible to this page. Historical
        observations are not current payment proof: rescan before relying on them. Seller-signed receipts
        never independently prove payment. Invoice links are your annotations or local matches you confirmed.
      </p>
      <p className="hint">
        Invalidation history is bounded. If it reaches capacity, the encrypted vault becomes read-only;
        deletion and backups retain this safety state so old observations cannot revive.
      </p>
      {unlocked && readOnly && (
        <Notice kind="warn">
          This reconciliation vault is read-only because invalidation history reached capacity or could not be
          refreshed. You can read, export or delete observations; restoring backups retains the safety state.
          Saving new observations is disabled.
        </Notice>
      )}
      {error !== undefined && <Notice kind="error">{error}</Notice>}
      {!unlocked ? (
        <button
          type="button"
          className="btn"
          disabled={busy || props.sellerKeyId === undefined}
          onClick={() => run(() => Promise.resolve(), true)}
        >
          Unlock encrypted reconciliation vault
        </button>
      ) : (
        <>
          <div className="actions">
            <button type="button" className="btn" onClick={reset}>
              Lock reconciliation vault
            </button>
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
            >
              Export encrypted reconciliation backup
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    'Delete encrypted observations in this seller and chain scope? Reorg invalidation history will be retained.',
                  )
                )
                  run(async (current) => current.clearRecords());
              }}
            >
              Delete encrypted observations
            </button>
          </div>
          <Field label="Search local records">
            {(id) => (
              <input id={id} type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
            )}
          </Field>
          <p className="hint">{records.length} stored records in the current seller and chain scope.</p>
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
                      guard();
                      if (!latest.current.scanMatchesCurrentScope || !latest.current.matches.includes(match))
                        throw new Error('Scan evidence is no longer current. Rescan before saving.');
                      await current.save(record);
                      guard();
                      props.onAnnounce?.('Observation saved in the encrypted reconciliation vault.');
                    })
                  }
                />
              ))}
          {!props.scanMatchesCurrentScope && (
            <p className="hint">
              Run a scan in the current seller and chain session before saving new observations.
            </p>
          )}
          {visible.length === 0 ? (
            <p>No records saved.</p>
          ) : (
            <ul className="plain-list">
              {visible.map((record) => (
                <li key={record.id} className="card">
                  <strong>
                    {findChain(record.chainId)?.name ?? `Chain ${record.chainId}`} · {assetLabel(record)}
                  </strong>
                  <p>
                    {record.evidenceStatus === 'invalidated-after-reorg'
                      ? 'Invalidated after a reorg; do not rely on this observation.'
                      : record.provenance === 'imported-history'
                        ? 'Imported historical observation — untrusted until independently rescanned.'
                        : 'Router-verified when scanned; historical observation, not current payment proof.'}
                  </p>
                  {record.invoiceDigest !== undefined && (
                    <p>
                      Manual invoice link (or a local match you confirmed): <Mono>{record.invoiceDigest}</Mono>
                    </p>
                  )}
                  <ProposalView
                    proposal={proposalFor(record)}
                    busy={busy || readOnly}
                    onConfirm={(digest) => confirmMatch(record, digest)}
                  />
                  <p>
                    Transaction: <Mono>{record.transactionHash}</Mono>
                  </p>
                  <p>
                    Recipient: <Mono>{record.stealthAddress}</Mono>
                  </p>
                  <p className="hint">
                    Block {record.blockNumber}, log {record.logIndex}. Recorded{' '}
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
            label="Encrypted reconciliation backup"
            hint="Only this vault’s encrypted format is accepted; plaintext legacy ledgers and seller receipts are never imported."
          >
            {(id) => (
              <textarea
                id={id}
                rows={3}
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
          <Field label="Encrypted reconciliation backup file">
            {(id) => (
              <input
                id={id}
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
                    setError('Encrypted reconciliation backup exceeds its safety limit.');
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
                        setError('The encrypted backup file could not be read.');
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
          >
            Preview encrypted backup
          </button>
          {preview !== undefined && (
            <div className="panel">
              {preview.readOnly && (
                <Notice kind="warn">
                  Activation will make this vault read-only. This backup or its combined invalidation history
                  carries a permanent safety state: new observations cannot be saved, and deleting records or
                  restoring another backup will not remove that state. Activate only if you accept this
                  limitation.
                </Notice>
              )}
              <p>
                {preview.recordCount} historical observation{preview.recordCount === 1 ? '' : 's'};{' '}
                {preview.invalidatedCount} already invalidated; {preview.invoiceCount} registered invoice
                {preview.invoiceCount === 1 ? '' : 's'}; {preview.receiptCount} archived receipt
                {preview.receiptCount === 1 ? '' : 's'}. Activation merges records as untrusted history,
                preserves known invalidation and does not verify payment.
              </p>
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
              >
                Activate previewed historical records
              </button>
            </div>
          )}
        </>
      )}
      <div className="panel">
        <h4>Legacy plaintext ledger</h4>
        <p className="hint">
          Legacy data is untrusted and may have been edited. It remains available for read, plaintext export
          and deletion only. It is never imported as payment proof or copied into the encrypted vault.
        </p>
        <button
          type="button"
          className="btn"
          onClick={() => {
            try {
              setLegacy(readReconciliationRecords());
              setError(undefined);
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : 'Legacy data could not be read.');
            }
          }}
        >
          Read untrusted legacy records
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            if (
              !window.confirm(
                'Export untrusted legacy records as plaintext? This reveals the stored payment details.',
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
              setError(cause instanceof Error ? cause.message : 'Legacy data could not be exported.');
            }
          }}
        >
          Export untrusted legacy plaintext
        </button>
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => {
            if (
              !window.confirm(
                'Delete all legacy plaintext reconciliation data, including unreadable records?',
              )
            )
              return;
            try {
              clearReconciliationRecords();
              setLegacy(undefined);
              setError(undefined);
            } catch {
              setError('Legacy plaintext data could not be deleted.');
            }
          }}
        >
          Delete legacy plaintext records
        </button>
        {legacy !== undefined && (
          <ul>
            {legacy.map((record) => (
              <li key={record.id}>
                Untrusted legacy transaction: <Mono>{record.transactionHash}</Mono>
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
  const linked = new Set(
    props.records
      .filter((r) => r.evidenceStatus === 'verified-at-scan' && r.invoiceDigest !== undefined)
      .map((r) => r.invoiceDigest),
  );
  return (
    <div className="panel">
      <h4>Registered invoices</h4>
      <p className="hint">
        Invoices you chose to register when creating them. Only the invoice digest, nonce, chain, asset, expected
        net amount and validity window are stored, encrypted; line items and memo are not. Matching runs on this
        device only. Nothing about an invoice is added to the payment or its announcement.
      </p>
      {props.invoices.length === 0 ? (
        <p>No invoices registered.</p>
      ) : (
        <>
          <ul className="plain-list">
            {props.invoices.map((invoice) => (
              <li key={invoice.invoiceDigest} className="card">
                <p>
                  Invoice <Mono>{invoice.invoiceDigest}</Mono>
                </p>
                <p className="hint">
                  {invoice.expectedNetMinorUnits} base units of {invoice.asset}; valid until{' '}
                  {new Date(invoice.expiresAt * 1000).toISOString()}.{' '}
                  {linked.has(invoice.invoiceDigest) ? 'Linked to a verified observation.' : 'No linked observation.'}
                </p>
                <button
                  type="button"
                  className="btn"
                  disabled={props.busy}
                  onClick={() => {
                    if (window.confirm('Remove this invoice registration? Saved observations and links are kept.'))
                      props.onRemove(invoice.invoiceDigest);
                  }}
                >
                  Remove registration
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="btn btn-danger"
            disabled={props.busy}
            onClick={() => {
              if (window.confirm('Remove all invoice registrations in this seller and chain scope?')) props.onClear();
            }}
          >
            Remove all invoice registrations
          </button>
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
  return (
    <div className="panel">
      <h4>Archived seller receipts</h4>
      <p className="hint">
        Receipts you issued, stored encrypted. A receipt signature is a seller-key attestation and never counts as
        payment evidence; archived receipts do not affect matching or verification.
      </p>
      {props.receipts.length === 0 ? (
        <p>No receipts archived.</p>
      ) : (
        <>
          <ul className="plain-list">
            {props.receipts.map(({ receipt, archivedAt }) => (
              <li key={receipt.signature} className="card">
                <p>
                  Transaction <Mono>{receipt.txHash}</Mono> for invoice <Mono>{receipt.invoiceDigest}</Mono>
                </p>
                <p className="hint">
                  {receipt.amountMinorUnits} base units of {receipt.asset}. Issued{' '}
                  {new Date(receipt.issuedAt * 1000).toISOString()}, archived {new Date(archivedAt).toISOString()}.
                </p>
                <button
                  type="button"
                  className="btn"
                  disabled={props.busy}
                  onClick={() => {
                    if (window.confirm('Delete this archived receipt from this device?'))
                      props.onRemove(receipt.signature);
                  }}
                >
                  Delete archived receipt
                </button>
              </li>
            ))}
          </ul>
          <div className="actions">
            <button
              type="button"
              className="btn"
              disabled={props.busy}
              onClick={() => {
                if (window.confirm('Export archived receipts as plaintext JSON? The file reveals payment details.'))
                  props.onExport();
              }}
            >
              Export archived receipts
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={props.busy}
              onClick={() => {
                if (window.confirm('Delete all archived receipts in this seller and chain scope?')) props.onClear();
              }}
            >
              Delete all archived receipts
            </button>
          </div>
        </>
      )}
    </div>
  );
}
