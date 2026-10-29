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
import { SOURCE_TRANSLATOR, useI18nOptional } from '../../i18n/context';
import { getAddress, isAddress } from 'viem/utils';
import { createPolicyMetaAddress, DELAY_PRESETS, type LimitRow } from './create';
import type { PolicyCtx } from './PolicyView';
import { BackupGate } from '../../views/SellerKeys';

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
  // Test renders without an I18nProvider fall back to the source English catalog.
  const i18n = useI18nOptional();
  const t = i18n?.t ?? SOURCE_TRANSLATOR.t;

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
      setImportMsg(mine ? { kind: 'ok', text: t('policy.create.imported') } : { kind: 'warn', text: t('policy.create.otherKeys') });
    } catch (e) {
      setImportMsg({ kind: 'error', text: t('policy.create.rejected', { reason: e instanceof Error && e.name === 'PolicySchemeError' ? e.message : userMessage(e) }) });
    }
  };

  const recover = (): void => {
    setLostMsg(undefined);
    try {
      let meta;
      try {
        meta = decodeScheme2MetaAddress(lostMeta.trim());
      } catch {
        throw new UserFacingError(t('policy.create.badMeta'));
      }
      const dests = lostDest.split(/[\s,]+/).filter((d) => d !== '');
      if (dests.length === 0 || !dests.every((d) => isAddress(d, { strict: true }))) throw new UserFacingError(t('policy.create.badDestinations'));
      const found = findPolicyFromCandidates({
        policyHash: meta.policyHash,
        destinations: dests.map((d) => getAddress(d)),
        delaySeconds: DELAY_PRESETS.map((p) => p.seconds),
        limitsRoots: [ZERO_HASH, ...records.map((r) => r.policy.limitsRoot).filter((r) => r !== ZERO_HASH)],
      });
      if (found === null) {
        setLostMsg({ kind: 'warn', text: t('policy.create.notFound') });
        return;
      }
      const limits = found.limitsRoot === ZERO_HASH ? [] : (records.find((r) => r.policy.limitsRoot === found.limitsRoot)?.limits ?? []);
      addRecord(buildPolicyRecord({ metaAddress: lostMeta.trim(), policy: found, limits }));
      setLostMsg({ kind: 'ok', text: t('policy.create.restored') });
    } catch (e) {
      setLostMsg({ kind: 'error', text: userMessage(e) });
    }
  };

  return (
    <section aria-labelledby="policy-create">
      <h3 id="policy-create">{t('policy.create.heading')}</h3>
      {session === undefined ? <Notice kind="info">{t('policy.create.needSession')}</Notice> : (
        // A policy meta-address derived from these keys invites payments: a backup or the typed waiver first (L1-01).
        <BackupGate>
          <Field label={t('policy.create.destinationLabel')} hint={t('policy.create.destinationHint')}>
            {(id, hint) => <input id={id} aria-describedby={hint} value={destination} onChange={(e) => { setDestination(e.target.value); }} spellCheck={false} />}
          </Field>
          <Field label={t('policy.create.delayLabel')}>
            {(id) => (
              <select id={id} value={delay.toString()} onChange={(e) => { setDelay(BigInt(e.target.value)); }}>
                {DELAY_PRESETS.map((p) => <option key={p.label} value={p.seconds.toString()}>{p.label}</option>)}
              </select>
            )}
          </Field>
          <fieldset>
            <legend>{t('policy.create.limitsLegend')}</legend>
            <p className="hint">{t('policy.create.limitsHint')}</p>
            {rows.map((r, i) => (
              <div key={i} className="row">
                <Field label={t('policy.create.tokenLabel', { n: String(i + 1) })}>{(id) => <input id={id} value={r.token} onChange={(e) => { setRows(rows.map((x, j) => (j === i ? { ...x, token: e.target.value } : x))); }} />}</Field>
                <Field label={t('policy.create.limitLabel', { n: String(i + 1) })}>{(id) => <input id={id} value={r.limit} onChange={(e) => { setRows(rows.map((x, j) => (j === i ? { ...x, limit: e.target.value } : x))); }} />}</Field>
                <Field label={t('policy.create.windowLabel', { n: String(i + 1) })}>{(id) => <input id={id} value={r.windowSeconds} onChange={(e) => { setRows(rows.map((x, j) => (j === i ? { ...x, windowSeconds: e.target.value } : x))); }} />}</Field>
              </div>
            ))}
            {rows.length < 8 && <button type="button" onClick={() => { setRows([...rows, EMPTY_ROW]); }}>{t('policy.create.addLimit')}</button>}
          </fieldset>
          <button type="button" onClick={create}>{t('policy.create.submit')}</button>
          {err !== undefined && <Notice kind="error">{err}</Notice>}
        </BackupGate>
      )}

      {records.length > 0 && (
        <>
          <h4>{t('policy.create.recordsHeading')}</h4>
          <Notice kind="warn" title={t('policy.create.keepTitle')}>
            {t('policy.create.keepBody')}
          </Notice>
          <ul className="plain">
            {records.map((r) => (
              <li key={r.policyHash}>
                <p><Mono>{r.metaAddress}</Mono></p>
                <p>{t('policy.create.recordDestination')} <Mono>{r.policy.destination}</Mono>{t('policy.create.recordTerms', { seconds: r.policy.delaySeconds.toString(), limits: r.limits.length === 0 ? t('policy.create.noLimits') : t('policy.create.tokenLimits', { count: String(r.limits.length) }) })}</p>
                <CopyButton text={r.metaAddress} label={t('policy.create.copyMeta')} />
                <button type="button" onClick={() => { downloadText(`ghostpay-policy-${r.policyHash.slice(2, 10)}.json`, serializePolicyRecord(r), 'application/json'); }}>{t('policy.create.download')}</button>
              </li>
            ))}
          </ul>
        </>
      )}

      <h4>{t('policy.create.restoreHeading')}</h4>
      <Field label={t('policy.create.pasteLabel')}>{(id) => <textarea id={id} rows={4} value={importText} onChange={(e) => { setImportText(e.target.value); }} spellCheck={false} />}</Field>
      <button type="button" onClick={importRecord}>{t('policy.create.import')}</button>
      {importMsg !== undefined && <Notice kind={importMsg.kind}>{importMsg.text}</Notice>}
      <details>
        <summary>{t('policy.create.lostSummary')}</summary>
        <p>{t('policy.create.lostBody')}</p>
        <Field label={t('policy.create.lostMetaLabel')}>{(id) => <input id={id} value={lostMeta} onChange={(e) => { setLostMeta(e.target.value); }} spellCheck={false} />}</Field>
        <Field label={t('policy.create.lostDestLabel')}>{(id) => <input id={id} value={lostDest} onChange={(e) => { setLostDest(e.target.value); }} spellCheck={false} />}</Field>
        <button type="button" onClick={recover}>{t('policy.create.search')}</button>
        {lostMsg !== undefined && <Notice kind={lostMsg.kind}>{lostMsg.text}</Notice>}
      </details>
    </section>
  );
}
