import {
  ZERO_HASH,
  buildPolicyRecord,
  decodeScheme2MetaAddress,
  findPolicyFromCandidates,
  parsePolicyRecord,
  serializePolicyRecord,
  type PolicyRecord,
} from '@ghostpay/policy-scheme';
import { bytesToHex } from '@noble/hashes/utils.js';
import { useState, type ReactNode } from 'react';
import { CopyButton, Field, Mono, Notice, downloadText } from '../../components/Common';
import { UserFacingError, userMessage } from '../../lib/errors';
import { useApp } from '../../state';
import { getAddress, isAddress } from 'viem/utils';
import { createPolicyMetaAddress, DELAY_PRESETS, type LimitRow } from './create';
import type { PolicyCtx } from './PolicyView';

const EMPTY_ROW: LimitRow = { token: '', limit: '', windowSeconds: '' };

function ownsRecord(rec: PolicyRecord, spendHex: string, viewHex: string): boolean {
  const m = decodeScheme2MetaAddress(rec.metaAddress);
  return bytesToHex(m.spendingPublicKey) === spendHex.replace(/^0x/, '').toLowerCase() && bytesToHex(m.viewingPublicKey) === viewHex.replace(/^0x/, '').toLowerCase();
}

/** Create a policy meta-address, keep its record, and recover a lost record (no contract change). */
export function PolicyCreate(props: { readonly ctx: PolicyCtx }): ReactNode {
  const app = useApp();
  const { records, addRecord } = props.ctx;
  const [destination, setDestination] = useState('');
  const [delay, setDelay] = useState<bigint>(86_400n);
  const [rows, setRows] = useState<readonly LimitRow[]>([EMPTY_ROW]);
  const [err, setErr] = useState<string | undefined>(undefined);
  const [importText, setImportText] = useState('');
  const [importMsg, setImportMsg] = useState<{ kind: 'ok' | 'error' | 'warn'; text: string } | undefined>(undefined);
  const [lostMeta, setLostMeta] = useState('');
  const [lostDest, setLostDest] = useState('');
  const [lostMsg, setLostMsg] = useState<{ kind: 'ok' | 'error' | 'warn'; text: string } | undefined>(undefined);
  const session = app.session;

  const create = (): void => {
    setErr(undefined);
    if (session === undefined) return;
    try {
      addRecord(createPolicyMetaAddress({ spendingPublicKeyHex: session.spendingPublicKey, viewingPublicKeyHex: session.viewingPublicKey, destination, delaySeconds: delay, limits: rows }));
    } catch (e) {
      setErr(userMessage(e));
    }
  };

  const importRecord = (): void => {
    setImportMsg(undefined);
    try {
      const rec = parsePolicyRecord(importText.trim());
      addRecord(rec);
      const mine = session !== undefined && ownsRecord(rec, session.spendingPublicKey, session.viewingPublicKey);
      setImportMsg(mine ? { kind: 'ok', text: 'Policy record verified and loaded.' } : { kind: 'warn', text: 'Record verified, but it belongs to other seller keys than the ones loaded now. Scanning will not find its payments.' });
    } catch (e) {
      setImportMsg({ kind: 'error', text: `The record was rejected: ${e instanceof Error && e.name === 'PolicySchemeError' ? e.message : userMessage(e)}.` });
    }
  };

  const recover = (): void => {
    setLostMsg(undefined);
    try {
      let meta;
      try {
        meta = decodeScheme2MetaAddress(lostMeta.trim());
      } catch {
        throw new UserFacingError('Enter the policy meta-address (st:eth:gp2:0x...).');
      }
      const dests = lostDest.split(/[\s,]+/).filter((d) => d !== '');
      if (dests.length === 0 || !dests.every((d) => isAddress(d, { strict: true }))) throw new UserFacingError('Enter one or more checksummed destination addresses.');
      const found = findPolicyFromCandidates({
        policyHash: meta.policyHash,
        destinations: dests.map((d) => getAddress(d)),
        delaySeconds: DELAY_PRESETS.map((p) => p.seconds),
        limitsRoots: [ZERO_HASH, ...records.map((r) => r.policy.limitsRoot).filter((r) => r !== ZERO_HASH)],
      });
      if (found === null) {
        setLostMsg({ kind: 'warn', text: 'No match among these destinations, the delay presets and the known limits roots. A policy with limits can only be restored from its record.' });
        return;
      }
      const limits = found.limitsRoot === ZERO_HASH ? [] : (records.find((r) => r.policy.limitsRoot === found.limitsRoot)?.limits ?? []);
      addRecord(buildPolicyRecord({ metaAddress: lostMeta.trim(), policy: found, limits }));
      setLostMsg({ kind: 'ok', text: 'Policy found and restored. Download the record now.' });
    } catch (e) {
      setLostMsg({ kind: 'error', text: userMessage(e) });
    }
  };

  return (
    <section aria-labelledby="policy-create">
      <h3 id="policy-create">Create a policy meta-address</h3>
      {session === undefined ? <Notice kind="info">Load or generate seller keys first (Seller keys).</Notice> : (
        <>
          <Field label="Destination (the only address withdrawals can go to)" hint="Use a wallet you control and keep. Changing it later takes twice the delay and can be cancelled by anyone holding your keys.">
            {(id, hint) => <input id={id} aria-describedby={hint} value={destination} onChange={(e) => { setDestination(e.target.value); }} spellCheck={false} />}
          </Field>
          <Field label="Withdrawal delay">
            {(id) => (
              <select id={id} value={delay.toString()} onChange={(e) => { setDelay(BigInt(e.target.value)); }}>
                {DELAY_PRESETS.map((p) => <option key={p.label} value={p.seconds.toString()}>{p.label}</option>)}
              </select>
            )}
          </Field>
          <fieldset>
            <legend>Per-token limits (optional)</legend>
            <p className="hint">Leave empty for no limits. With limits, a token without a row can never be withdrawn. Amounts are base units; window in seconds; token "native" for the coin.</p>
            {rows.map((r, i) => (
              <div key={i} className="row">
                <Field label={`Token ${String(i + 1)}`}>{(id) => <input id={id} value={r.token} onChange={(e) => { setRows(rows.map((x, j) => (j === i ? { ...x, token: e.target.value } : x))); }} />}</Field>
                <Field label={`Limit ${String(i + 1)}`}>{(id) => <input id={id} value={r.limit} onChange={(e) => { setRows(rows.map((x, j) => (j === i ? { ...x, limit: e.target.value } : x))); }} />}</Field>
                <Field label={`Window ${String(i + 1)} (seconds)`}>{(id) => <input id={id} value={r.windowSeconds} onChange={(e) => { setRows(rows.map((x, j) => (j === i ? { ...x, windowSeconds: e.target.value } : x))); }} />}</Field>
              </div>
            ))}
            {rows.length < 8 && <button type="button" onClick={() => { setRows([...rows, EMPTY_ROW]); }}>Add limit</button>}
          </fieldset>
          <button type="button" onClick={create}>Create policy meta-address</button>
          {err !== undefined && <Notice kind="error">{err}</Notice>}
        </>
      )}

      {records.length > 0 && (
        <>
          <h4>Your policy meta-addresses</h4>
          <Notice kind="warn" title="Keep the policy record">
            Without the record (destination, delay and limits) the account cannot be deployed and nothing can be withdrawn. It holds no
            keys, but it links your destination to this meta-address: store it privately, next to your seller key backup.
          </Notice>
          <ul className="plain">
            {records.map((r) => (
              <li key={r.policyHash}>
                <p><Mono>{r.metaAddress}</Mono></p>
                <p>Destination <Mono>{r.policy.destination}</Mono>, delay {r.policy.delaySeconds.toString()} s, {r.limits.length === 0 ? 'no limits' : `${String(r.limits.length)} token limit(s)`}.</p>
                <CopyButton text={r.metaAddress} label="Copy meta-address" />
                <button type="button" onClick={() => { downloadText(`ghostpay-policy-${r.policyHash.slice(2, 10)}.json`, serializePolicyRecord(r), 'application/json'); }}>Download policy record</button>
              </li>
            ))}
          </ul>
        </>
      )}

      <h4>Restore a policy record</h4>
      <Field label="Paste a policy record (JSON)">{(id) => <textarea id={id} rows={4} value={importText} onChange={(e) => { setImportText(e.target.value); }} spellCheck={false} />}</Field>
      <button type="button" onClick={importRecord}>Import record</button>
      {importMsg !== undefined && <Notice kind={importMsg.kind}>{importMsg.text}</Notice>}
      <details>
        <summary>Lost the record?</summary>
        <p>The policy hash in a meta-address can be matched against likely destinations and the delay presets, locally. Policies with limits need their record.</p>
        <Field label="Policy meta-address">{(id) => <input id={id} value={lostMeta} onChange={(e) => { setLostMeta(e.target.value); }} spellCheck={false} />}</Field>
        <Field label="Candidate destinations (comma or space separated)">{(id) => <input id={id} value={lostDest} onChange={(e) => { setLostDest(e.target.value); }} spellCheck={false} />}</Field>
        <button type="button" onClick={recover}>Search</button>
        {lostMsg !== undefined && <Notice kind={lostMsg.kind}>{lostMsg.text}</Notice>}
      </details>
    </section>
  );
}
