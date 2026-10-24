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
import {
  createCurrentReconciliationVault,
  MAX_VAULT_BYTES,
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
function MatchLedgerAction(props: {
  readonly match: ScanMatch;
  readonly sellerKeyId: string;
  readonly onSave: (record: ReconciliationRecord) => void;
  readonly busy: boolean;
  readonly onError: (message: string) => void;
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
    </div>
  );
}
export function ReconciliationLedger(props: ReconciliationLedgerProps): ReactNode {
  const [records, setRecords] = useState<readonly VaultRecord[]>([]);
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
            setRecords(next.records);
            setReadOnly(next.readOnly);
          }
        },
        () => {
          if (mounted.current && revision.current === actionRevision && readRevision.current === refreshId) {
            setRecords([]);
            setReadOnly(true);
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
        if (readGeneration === readRevision.current) {
          setRecords(next.records);
          setReadOnly(next.readOnly);
        }
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
  return (
    <section className="panel reconciliation-ledger" aria-labelledby="ledger-heading">
      <h3 id="ledger-heading">Local payment reconciliation</h3>
      <p className="hint">
        Selected observations are encrypted on this device with your viewing key. The public seller-key
        identifier, chain and ciphertext size remain visible. Keep an encrypted backup and your seller
        keystore; losing the seller keys loses access. Unlocked data is visible to this page. Historical
        observations are not current payment proof: rescan before relying on them. Seller-signed receipts
        never independently prove payment. Invoice links are your annotations.
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
                      Manual invoice link: <Mono>{record.invoiceDigest}</Mono>
                    </p>
                  )}
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
                {preview.invalidatedCount} already invalidated. Activation merges records as untrusted
                history, preserves known invalidation and does not verify payment.
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
