import { findChain, tokensForChain } from '@ghostpay/chain-adapters';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Field, Mono, Notice, downloadText } from './Common';
import {
  clearReconciliationRecords,
  clearReconciliationScope,
  exportReconciliationLedger,
  isReconciliationLedgerEnabled,
  RECONCILIATION_LEDGER_CHANGE_EVENT,
  readReconciliationRecords,
  recordFromVerifiedMatch,
  saveReconciliationRecord,
  searchReconciliationRecords,
  setReconciliationLedgerEnabled,
  type ReconciliationRecord,
} from '../lib/reconciliationLedger';
import type { ScanMatch } from '../lib/scanClient';
import { formatUnits } from '../lib/format';

export interface ReconciliationLedgerProps {
  readonly chainId: number;
  readonly sellerKeyId: string | undefined;
  readonly matches: readonly ScanMatch[];
  readonly scanMatchesCurrentScope: boolean;
  readonly onAnnounce?: (message: string) => void;
}

function safeInitial(): { enabled: boolean; records: readonly ReconciliationRecord[]; error?: string } {
  try {
    return { enabled: isReconciliationLedgerEnabled(), records: readReconciliationRecords() };
  } catch (error) {
    return { enabled: false, records: [], error: error instanceof Error ? error.message : 'The local ledger could not be read.' };
  }
}

function assetLabel(record: ReconciliationRecord): string {
  if (record.asset === 'native') return `${formatUnits(BigInt(record.amountMinorUnits), 18)} ${findChain(record.chainId)?.nativeSymbol ?? 'native'}`;
  const token = tokensForChain(record.chainId).find((item) => item.address.toLowerCase() === record.asset);
  return token === undefined
    ? `${record.amountMinorUnits} base units of ${record.asset}`
    : `${formatUnits(BigInt(record.amountMinorUnits), token.decimals)} ${token.symbol}`;
}

function MatchLedgerAction(props: {
  readonly match: ScanMatch;
  readonly sellerKeyId: string | undefined;
  readonly eligibleScope: boolean;
  readonly enabled: boolean;
  readonly onSave: (record: ReconciliationRecord) => void;
  readonly onError: (message: string) => void;
}): ReactNode {
  const [invoiceDigest, setInvoiceDigest] = useState('');
  const match = props.match;
  if (match.receipt !== 'verified') return null;
  const sellerKeyId = props.sellerKeyId;
  if (!props.eligibleScope || sellerKeyId === undefined) {
    return <p className="hint">This result belongs to another chain or seller-key session. Run a scan with the current keys before saving it.</p>;
  }
  if (!props.enabled) return null;
  if (!match.viaRouter || match.metadata === undefined) return null;
  if (match.announcement.transactionHash === undefined) return <p className="hint">No transaction hash was returned, so this payment cannot be added to the local ledger.</p>;

  return (
    <div className="ledger-save">
      <Field label="Invoice digest (optional, manual link)" hint="This seller-entered digest links the scan record to an invoice by your assertion. The invoice is not opened or checked.">
        {(id, describedBy) => <input id={id} aria-describedby={describedBy} className="mono" inputMode="text" autoComplete="off" value={invoiceDigest} onChange={(event) => { setInvoiceDigest(event.target.value); }} placeholder="0x…" />}
      </Field>
      <button
        type="button"
        className="btn"
        onClick={() => {
          try {
            const digest = invoiceDigest.trim().toLowerCase();
            const record = recordFromVerifiedMatch(match, sellerKeyId, digest === '' ? undefined : digest);
            props.onSave(record);
            setInvoiceDigest('');
          } catch (error) {
            props.onError(error instanceof Error ? error.message : 'This scan result could not be saved.');
          }
        }}
      >
        Add verified payment to ledger
      </button>
    </div>
  );
}

export function ReconciliationLedger(props: ReconciliationLedgerProps): ReactNode {
  const [enabled, setEnabled] = useState(false);
  const [records, setRecords] = useState<readonly ReconciliationRecord[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const scopedRecords = useMemo(() => records.filter((record) => record.chainId === props.chainId && record.sellerKeyId === props.sellerKeyId), [records, props.chainId, props.sellerKeyId]);
  const visible = useMemo(() => searchReconciliationRecords(scopedRecords, query), [scopedRecords, query]);

  useEffect(() => {
    const refresh = (): void => {
      const current = safeInitial();
      setEnabled(current.enabled);
      setRecords(current.records);
      setError(current.error);
    };
    refresh();
    window.addEventListener(RECONCILIATION_LEDGER_CHANGE_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(RECONCILIATION_LEDGER_CHANGE_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const saveRecord = (record: ReconciliationRecord): void => {
    try {
      const next = saveReconciliationRecord(record);
      setRecords(next);
      setError(undefined);
      props.onAnnounce?.('Verified payment added to the local ledger.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The local ledger could not save this record.');
    }
  };

  return (
    <section className="panel reconciliation-ledger" aria-labelledby="ledger-heading">
      <h3 id="ledger-heading">Local payment reconciliation</h3>
      <p className="hint">This optional ledger stores verified router-scan payment evidence on this device. It is not encrypted; anyone with access to this browser profile may read it. Records are locally editable and are not tamper-evident or authoritative. It stores no private keys, customer tags, invoice contents, or seller-signed receipts. A seller receipt is never treated as payment proof. Exported JSON is also plain text. Records are historical evidence and may be invalidated by a later reorg; rescan before relying on them. Use one tab at a time to change records; reload other open tabs before editing. This panel shows the current seller-key and chain scope; disable and erase removes every scope.</p>
      {error !== undefined && <Notice kind="error">{error}</Notice>}
      {error !== undefined && (
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => {
            if (!window.confirm('Erase local reconciliation ledger data, including unreadable records?')) return;
            try {
              clearReconciliationRecords();
              setRecords([]);
              setError(undefined);
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : 'The local ledger could not be erased.');
            }
          }}
        >
          Erase unreadable ledger data
        </button>
      )}
      {!enabled ? (
        <>
          <p>Nothing is saved until you enable the ledger and choose individual verified payments to add.</p>
          <button
            type="button"
            className="btn"
            onClick={() => {
              try {
                setReconciliationLedgerEnabled(true);
                setEnabled(true);
                setError(undefined);
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : 'Local storage is unavailable.');
              }
            }}
          >
            Enable local ledger on this device
          </button>
        </>
      ) : (
        <>
          <div className="actions">
            <button
              type="button"
              className="btn"
              onClick={() => {
                try {
                  const json = exportReconciliationLedger(scopedRecords);
                  downloadText('ghostpay-reconciliation.json', json, 'application/json');
                  setError(undefined);
                } catch (cause) {
                  setError(cause instanceof Error ? cause.message : 'The ledger could not be exported.');
                }
              }}
              disabled={scopedRecords.length === 0}
            >
              Export ledger JSON
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                if (props.sellerKeyId === undefined) return;
                if (!window.confirm('Delete all local reconciliation records for the current seller keys and chain?')) return;
                try {
                  setRecords(clearReconciliationScope(props.chainId, props.sellerKeyId));
                  setError(undefined);
                  props.onAnnounce?.('Current-scope reconciliation records deleted.');
                } catch (cause) {
                  setError(cause instanceof Error ? cause.message : 'The local ledger could not be cleared.');
                }
              }}
              disabled={scopedRecords.length === 0 || props.sellerKeyId === undefined}
            >
              Delete ledger records
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                if (!window.confirm('Disable the ledger and erase all its local records?')) return;
                try {
                  setReconciliationLedgerEnabled(false);
                  setRecords([]);
                  setEnabled(false);
                  setQuery('');
                  setError(undefined);
                  props.onAnnounce?.('Local ledger disabled and deleted.');
                } catch (cause) {
                  setError(cause instanceof Error ? cause.message : 'The local ledger could not be disabled.');
                }
              }}
            >
              Disable and erase ledger
            </button>
          </div>
          <Field label="Search local records">
            {(id) => <input id={id} type="search" value={query} onChange={(event) => { setQuery(event.target.value); }} placeholder="Invoice digest, transaction, recipient…" />}
          </Field>
          <p className="hint">{String(scopedRecords.length)} stored record{scopedRecords.length === 1 ? '' : 's'} in this scope; {String(visible.length)} match{visible.length === 1 ? '' : 'es'}. Export and delete apply only to this scope.</p>
          {props.matches.map((match) => (
            <MatchLedgerAction
              key={`${String(match.chainId)}:${match.announcement.id}:${match.announcement.blockHash}`}
              match={match}
              sellerKeyId={props.sellerKeyId}
              eligibleScope={props.scanMatchesCurrentScope && match.chainId === props.chainId}
              enabled={enabled}
              onSave={saveRecord}
              onError={setError}
            />
          ))}
          {visible.length === 0 ? <p>{query.trim() === '' ? 'No records saved.' : 'No records match that search.'}</p> : (
            <ul className="plain-list">
              {visible.map((record) => (
                <li key={record.id} className="card">
                  <strong>{findChain(record.chainId)?.name ?? `Chain ${String(record.chainId)}`} · {assetLabel(record)}</strong>
                  <p>Stored scan status: {record.evidenceStatus === 'verified-at-scan' ? 'router-verified when recorded (not independently revalidated)' : 'invalidated after a scan reorg'}; block {record.blockNumber}, log {String(record.logIndex)}{record.viewTagMatched ? '' : ' (deep scan: announced view tag mismatch)'}.</p>
                  {record.invoiceDigest !== undefined && <p>Manual invoice link: <Mono>{record.invoiceDigest}</Mono></p>}
                  <p>Transaction: <Mono>{record.transactionHash}</Mono></p>
                  <p>Recipient: <Mono>{record.stealthAddress}</Mono></p>
                  <p className="hint">Recorded {new Date(record.recordedAt).toISOString()}. A later reorg or chain change may invalidate the evidence; rescan before relying on it.</p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
