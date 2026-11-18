import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { UserFacingError, captureUserMessage, displayMessage, type DisplayMessage } from '../lib/errors';
import { loadedKeysRecoverable } from '../lib/keyVault';
import { RecoveredMasterKeys, RecoveredPaymentKeys, openStealthExport } from '../lib/paymentKeyExport';
import { captureSessionVersionGuard, getSessionBackup, sessionHasExternalCopy } from '../lib/session';
import { STEALTH_EXPORT_LIMITS, type StealthKeypairHeader, type StealthMasterHeader, type StealthPublicRecord } from '../lib/stealthExport';
import type { MessageKey } from '../i18n/catalog';
import { Field, Mono, Notice, SafeText } from './Common';
import { useExportOperation, useExportT, useLatestExportT, type ExportMessage } from './StealthExportCommon';
import { chainLabel, startDownload } from './StealthExportPayment';

/** Public view of an opened export; the decrypted keys stay boxed in a ref, never in React state. */
type Shown =
  | { readonly kind: 'public'; readonly record: StealthPublicRecord }
  | { readonly kind: 'keypair'; readonly header: StealthKeypairHeader }
  | { readonly kind: 'master'; readonly header: StealthMasterHeader; readonly loaded: boolean };

const SCOPE_KEYS: Readonly<Record<StealthKeypairHeader['scope'], MessageKey>> = {
  single: 'stealthExport.open.scope.single',
  selected: 'stealthExport.open.scope.selected',
  'all-discovered': 'stealthExport.open.scope.allDiscovered',
};

/**
 * "Open a stealth key export" (spec 18 flow 4): reads and decrypts a `ghostpay-stealth-*` file in this browser, also in a
 * fresh session with no keys loaded. Payment keys are listed after every key was checked against its address, and each
 * one can be downloaded as raw text after a second confirmation; master keys can be loaded through the hex-import path.
 * The idle lock, any key change, closing the export and leaving the page wipe the decrypted keys.
 */
export function StealthExportRecovery(props: { readonly announce: (message: string) => void }): ReactNode {
  const t = useExportT();
  const latestT = useLatestExportT(t);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | undefined>(undefined);
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<ExportMessage | undefined>(undefined);
  const [shown, setShown] = useState<Shown | undefined>(undefined);
  const [rawIndex, setRawIndex] = useState<number | undefined>(undefined);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const held = useRef<RecoveredPaymentKeys | RecoveredMasterKeys | undefined>(undefined);
  const confirmRef = useRef<HTMLDivElement | null>(null);
  const mounted = useRef(false);

  const wipeHeld = (): void => {
    held.current?.dispose();
    held.current = undefined;
  };
  const reset = (): void => {
    wipeHeld();
    setShown(undefined); setRawIndex(undefined); setConfirmReplace(false); setPassphrase(''); setBusy(false);
  };
  const op = useExportOperation(reset);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; wipeHeld(); };
  }, []);
  useEffect(() => { if (rawIndex !== undefined) confirmRef.current?.focus(); }, [rawIndex]);

  const fail = (text: DisplayMessage): void => { setMessage({ kind: 'error', text }); };
  const done = (text: DisplayMessage): void => {
    setMessage({ kind: 'ok', text });
    props.announce(displayMessage(text, latestT.current));
  };
  const closeExport = (): void => {
    op.stop(); reset(); setMessage(undefined);
  };

  const onOpen = (e: FormEvent): void => {
    e.preventDefault();
    if (file === undefined) { fail({ key: 'stealthExport.open.chooseFile' }); return; }
    if (file.size > STEALTH_EXPORT_LIMITS.keypairFileBytes) { fail({ key: 'error.stealthExport.tooLarge' }); return; }
    const controller = op.start();
    wipeHeld(); setShown(undefined); setRawIndex(undefined); setConfirmReplace(false);
    const selected = file; const pass = passphrase;
    setBusy(true);
    setMessage({ kind: 'ok', text: { key: 'stealthExport.open.working' } });
    void (async () => {
      try {
        const text = await selected.text();
        if (!op.current(controller)) return;
        const opened = await openStealthExport(text, pass, { signal: controller.signal });
        if (!op.current(controller)) {
          if (opened.kind !== 'public') opened.keys.dispose();
          return;
        }
        setPassphrase(''); setBusy(false); setMessage(undefined);
        if (opened.kind === 'public') {
          setShown({ kind: 'public', record: opened.record });
        } else if (opened.kind === 'keypair') {
          held.current = opened.keys;
          setShown({ kind: 'keypair', header: opened.keys.header });
        } else {
          held.current = opened.keys;
          setShown({ kind: 'master', header: opened.keys.header, loaded: opened.keys.loaded });
        }
      } catch (error) {
        if (!op.current(controller)) return;
        setPassphrase(''); setBusy(false);
        fail(captureUserMessage(error));
      }
    })();
  };

  const onDownloadRaw = (index: number): void => {
    const keys = held.current;
    try {
      if (!(keys instanceof RecoveredPaymentKeys)) throw new UserFacingError({ key: 'error.paymentKeyExport.recoveredKeysClosed' });
      const exported = keys.rawKeyFile(index, true);
      setRawIndex(undefined);
      if (startDownload(exported, fail)) done({ key: 'stealthExport.raw.done' });
    } catch (error) {
      setRawIndex(undefined);
      fail(captureUserMessage(error));
    }
  };

  const install = (): void => {
    setConfirmReplace(false);
    const keys = held.current;
    held.current = undefined;
    try {
      if (!(keys instanceof RecoveredMasterKeys)) throw new UserFacingError({ key: 'error.paymentKeyExport.recoveredKeysClosed' });
      // Installing changes the session, which resets this panel through useExportOperation before the outcome is shown.
      keys.install();
      reset();
      done({ key: 'stealthExport.open.master.done' });
    } catch (error) {
      reset();
      fail(captureUserMessage(error));
    }
  };

  // Loading replaces the loaded keys: without a recoverable copy that needs the same confirmation as unlocking a vault
  // (L1-01, C-R12). A key change during the storage read drops the request.
  const onLoadMaster = (): void => {
    if (getSessionBackup() === undefined || sessionHasExternalCopy()) { install(); return; }
    const unchanged = captureSessionVersionGuard();
    void loadedKeysRecoverable().then((recoverable) => {
      if (!mounted.current) return;
      try { unchanged(); } catch { return; }
      if (recoverable) install(); else setConfirmReplace(true);
    });
  };

  return (
    <section className="panel" aria-labelledby="stealth-open-h" data-testid="stealth-export-open">
      <h3 id="stealth-open-h">{t('stealthExport.open.heading')}</h3>
      <p>{t('stealthExport.open.body')}</p>
      {message !== undefined && <Notice kind={message.kind}>{displayMessage(message.text, t)}</Notice>}
      <form onSubmit={onOpen} className="stack" autoComplete="off">
        <Field label={t('stealthExport.open.file')}>{(id) => <>
          <input id={id} aria-describedby={file === undefined ? undefined : `${id}-file`} ref={fileInput} type="file" accept="application/json,.json" onChange={(e) => {
            const chosen = e.currentTarget.files?.[0]; e.currentTarget.value = '';
            if (chosen === undefined) return;
            closeExport(); setFile(chosen);
          }} />
          {file !== undefined && <p className="hint" id={`${id}-file`}>{t('upload.selectedFile')}: <bdi><SafeText value={file.name} /></bdi></p>}
        </>}</Field>
        <Field label={t('stealthExport.open.passphrase')} hint={t('stealthExport.open.passphraseHint')}>
          {(id, d) => <input id={id} aria-describedby={d} type="password" autoComplete="off" name="ghostpay-stealth-export-open" value={passphrase} onChange={(e) => { setPassphrase(e.target.value); }} />}
        </Field>
        <button type="submit" className="btn" data-testid="stealth-export-open-submit" disabled={busy || file === undefined}>{t('stealthExport.open.submit')}</button>
        {busy && <button type="button" className="btn" onClick={closeExport}>{t('stealthExport.cancel')}</button>}
      </form>

      {shown?.kind === 'public' && (
        <Notice kind="info" title={t('stealthExport.open.public.title')}>
          <p>{t('stealthExport.open.public.body')}</p>
          <p>{chainLabel(shown.record.chainId, t)}</p>
          <p><Mono>{shown.record.stealthAddress}</Mono></p>
        </Notice>
      )}

      {shown?.kind === 'keypair' && (
        <div className="stack" data-testid="stealth-export-open-keypair">
          <h4>{t('stealthExport.open.keypair.title')}</h4>
          <p>{t('stealthExport.open.keypair.summary', { count: shown.header.count, chain: chainLabel(shown.header.chainId, t), scope: t(SCOPE_KEYS[shown.header.scope]) })}</p>
          <p className="hint">{t('stealthExport.details.futureDeposits')}</p>
          <ul className="plain-list">
            {shown.header.payments.map((record, index) => (
              <li key={record.stealthAddress} className="card">
                <p><Mono>{record.stealthAddress}</Mono></p>
                <p className="hint">{t('stealthExport.open.entry.block', { block: record.announcement.blockNumber, log: String(record.announcement.logIndex) })}</p>
                {rawIndex === index ? (
                  <div ref={confirmRef} tabIndex={-1} role="group" aria-label={t('stealthExport.raw.confirm.title')}>
                    <Notice kind="warn" title={t('stealthExport.raw.confirm.title')}>{t('stealthExport.raw.confirm.body')}</Notice>
                    <button type="button" className="btn btn-danger" onClick={() => { onDownloadRaw(index); }}>{t('stealthExport.raw.confirm.download')}</button>{' '}
                    <button type="button" className="btn" onClick={() => { setRawIndex(undefined); }}>{t('stealthExport.cancel')}</button>
                  </div>
                ) : (
                  <button type="button" className="btn" aria-label={t('stealthExport.open.entry.downloadFor', { address: record.stealthAddress })} onClick={() => { setMessage(undefined); setRawIndex(index); }}>
                    {t('stealthExport.open.entry.download')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {shown?.kind === 'master' && (
        <div className="stack" data-testid="stealth-export-open-master">
          <h4>{t('stealthExport.open.master.title')}</h4>
          <p><Mono>{shown.header.metaAddress}</Mono></p>
          <p>{t('stealthExport.open.master.body')}</p>
          {shown.loaded ? (
            <Notice kind="info">{t('stealthExport.open.master.loaded')}</Notice>
          ) : (
            <p><button type="button" className="btn btn-primary" disabled={confirmReplace} onClick={onLoadMaster}>{t('stealthExport.open.master.load')}</button></p>
          )}
          {confirmReplace && (
            <Notice kind="warn" title={t('stealthExport.open.replace.title')}>
              <p>{t('stealthExport.open.replace.body')}</p>
              <button type="button" className="btn btn-danger" onClick={install}>{t('stealthExport.open.replace.confirm')}</button>{' '}
              <button type="button" className="btn" onClick={() => { setConfirmReplace(false); }}>{t('stealthExport.cancel')}</button>
            </Notice>
          )}
        </div>
      )}

      {shown !== undefined && shown.kind !== 'public' && (
        <p><button type="button" className="btn" onClick={closeExport}>{t('stealthExport.open.close')}</button></p>
      )}
    </section>
  );
}

// i18n-use: stealthExport.open.scope.single stealthExport.open.scope.selected stealthExport.open.scope.allDiscovered stealthExport.open.chooseFile stealthExport.open.master.done stealthExport.open.working stealthExport.raw.done
