import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { UserFacingError, captureUserMessage, displayMessage, type DisplayMessage } from '../lib/errors';
import { recognizeRecoveryFile, type RecoveryFile } from '../lib/recoveryFile';
import { loadedKeysRecoverable } from '../lib/keyVault';
import { RecoveredMasterKeys, RecoveredPaymentKeys, openStealthExport, verifyStealthExport, type VerifiedStealthExport } from '../lib/paymentKeyExport';
import { captureSessionVersionGuard, getSessionBackup, sessionHasExternalCopy } from '../lib/session';
import type { StealthKeypairHeader, StealthMasterHeader, StealthPublicRecord } from '../lib/stealthExport';
import type { MessageKey } from '../i18n/catalog';
import { Field, Mono, Notice } from './Common';
import { useExportOperation, useExportT, useLatestExportT, type ExportMessage } from './StealthExportCommon';
import { chainLabel, startDownload } from './StealthExportPayment';

/** Public view of an opened export; the decrypted keys stay boxed in a ref, never in React state. */
type Shown =
  | { readonly kind: 'public'; readonly record: StealthPublicRecord }
  | { readonly kind: 'keypair'; readonly header: StealthKeypairHeader }
  | { readonly kind: 'master'; readonly header: StealthMasterHeader; readonly loaded: boolean };

const RECOVERY_LABELS: Readonly<Record<RecoveryFile['kind'], MessageKey>> = {
  keystore: 'recoveryFile.keystore',
  public: 'stealthExport.open.public.title',
  keypair: 'recoveryFile.keypair',
  master: 'recoveryFile.master',
};

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
export function StealthExportRecovery(props: {
  readonly announce: (message: string) => void;
  readonly recovery?: {
    readonly loadKeystore?: (text: string, passphrase: string) => void;
    readonly importing: boolean;
    readonly cancelImport: () => void;
  };
}): ReactNode {
  const t = useExportT();
  const latestT = useLatestExportT(t);
  const [recognized, setRecognized] = useState<RecoveryFile>();
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<ExportMessage | undefined>(undefined);
  const [shown, setShown] = useState<Shown | undefined>(undefined);
  const [verified, setVerified] = useState<VerifiedStealthExport | undefined>(undefined);
  const [rawIndex, setRawIndex] = useState<number | undefined>(undefined);
  const [confirmReplace, setConfirmReplace] = useState<'saved' | 'unbacked' | undefined>(undefined);
  const held = useRef<RecoveredPaymentKeys | RecoveredMasterKeys | undefined>(undefined);
  const replacement = useRef<{ readonly keys: RecoveredMasterKeys; readonly controller: AbortController; readonly unchanged: () => void } | undefined>(undefined);
  const confirmRef = useRef<HTMLDivElement | null>(null);
  const mounted = useRef(false);

  const wipeHeld = (): void => {
    held.current?.dispose();
    held.current = undefined;
  };
  const reset = (): void => {
    wipeHeld();
    setRecognized(undefined);
    replacement.current = undefined;
    setShown(undefined); setVerified(undefined); setRawIndex(undefined); setConfirmReplace(undefined); setPassphrase(''); setBusy(false); setMessage(undefined);
  };
  const op = useExportOperation(reset);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; wipeHeld(); };
  }, []);
  useEffect(() => { if (rawIndex !== undefined || confirmReplace !== undefined) confirmRef.current?.focus(); }, [rawIndex, confirmReplace]);

  const fail = (text: DisplayMessage): void => { setMessage({ kind: 'error', text }); };
  const done = (text: DisplayMessage): void => {
    setMessage({ kind: 'ok', text });
    props.announce(displayMessage(text, latestT.current));
  };
  const closeExport = (): void => {
    op.stop(); reset(); setMessage(undefined);
  };

  const openSelected = (mode: 'open' | 'verify'): void => {
    if (recognized === undefined || recognized.kind === 'keystore') { fail({ key: 'stealthExport.open.chooseFile' }); return; }
    const controller = op.start();
    wipeHeld(); replacement.current = undefined;
    setShown(undefined); setVerified(undefined); setRawIndex(undefined); setConfirmReplace(undefined);
    const text = recognized.text; const pass = passphrase;
    setBusy(true);
    setMessage({ kind: 'ok', text: { key: 'stealthExport.open.working' } });
    void (async () => {
      try {
        if (mode === 'verify') {
          const result = await verifyStealthExport(text, pass, { signal: controller.signal });
          if (!op.current(controller)) return;
          setPassphrase(''); setBusy(false); setVerified(result);
          done({ key: 'stealthExport.verify.success' });
          return;
        }
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

  const selectFile = (chosen: File): void => {
    closeExport();
    props.recovery?.cancelImport();
    const controller = op.start();
    setBusy(true);
    void recognizeRecoveryFile(chosen, controller.signal).then((result) => {
      if (!op.current(controller)) return;
      setRecognized(result); setBusy(false);
    }).catch((error: unknown) => {
      if (!op.current(controller)) return;
      setBusy(false); fail(captureUserMessage(error));
    });
  };

  const onOpen = (e: FormEvent): void => {
    e.preventDefault();
    if (recognized?.kind === 'keystore') {
      props.recovery?.loadKeystore?.(recognized.text, passphrase);
      setPassphrase('');
    } else if (recognized !== undefined) openSelected('open');
  };
  const keystore = recognized?.kind === 'keystore';
  const canLoad = !keystore || props.recovery?.loadKeystore !== undefined;
  const needsPassphrase = recognized !== undefined && recognized.kind !== 'public' && canLoad;
  const working = busy || props.recovery?.importing === true;


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

  const install = (keys: RecoveredMasterKeys): void => {
    if (held.current !== keys) return;
    setConfirmReplace(undefined);
    replacement.current = undefined;
    held.current = undefined;
    try {
      // Installing changes the session, which resets this panel through useExportOperation before the outcome is shown.
      keys.install();
      reset();
      done({ key: 'stealthExport.open.master.done' });
    } catch (error) {
      reset();
      fail(captureUserMessage(error));
    }
  };

  // Every replacement needs fresh consent for this exact export and session. The storage read only selects the warning;
  // its result can never install keys. A missing copy keeps the existing sole-copy loss warning (L1-01, C-R12).
  const onLoadMaster = (): void => {
    const controller = op.start();
    const selected = held.current;
    if (!(selected instanceof RecoveredMasterKeys) || selected.loaded) return;
    if (getSessionBackup() === undefined) { install(selected); return; }
    const unchanged = captureSessionVersionGuard();
    setBusy(true); setMessage(undefined); setConfirmReplace(undefined); replacement.current = undefined;
    void loadedKeysRecoverable().then((recoverable) => {
      // A storage read belongs to this export only. Closing, locking or opening another export cancels the request.
      if (!mounted.current || !op.current(controller) || held.current !== selected) return;
      try { unchanged(); } catch { return; }
      setBusy(false);
      replacement.current = { keys: selected, controller, unchanged };
      setConfirmReplace(recoverable ? 'saved' : 'unbacked');
    }).catch((error: unknown) => {
      if (!op.current(controller) || held.current !== selected) return;
      setBusy(false); fail(captureUserMessage(error));
    });
  };

  const confirmInstall = (): void => {
    const consent = replacement.current;
    if (consent === undefined || !op.current(consent.controller) || held.current !== consent.keys) return;
    try { consent.unchanged(); } catch { return; }
    if (confirmReplace === 'unbacked' || sessionHasExternalCopy()) { install(consent.keys); return; }
    // A vault can disappear in another tab after the initial warning. Recheck before replacing; losing the saved copy
    // requires a new confirmation of the stronger warning, never a silent change of the consent's meaning.
    setBusy(true);
    void loadedKeysRecoverable().then((recoverable) => {
      if (!op.current(consent.controller) || replacement.current !== consent || held.current !== consent.keys) return;
      try { consent.unchanged(); } catch { return; }
      setBusy(false);
      if (recoverable) install(consent.keys); else setConfirmReplace('unbacked');
    }).catch((error: unknown) => {
      if (!op.current(consent.controller) || replacement.current !== consent) return;
      setBusy(false); fail(captureUserMessage(error));
    });
  };

  return (
    <section className="panel" aria-labelledby="stealth-open-h" data-testid="stealth-export-open">
      <h3 id="stealth-open-h">{t('stealthExport.open.heading')}</h3>
      <p>{t('stealthExport.open.body')}</p>
      {message !== undefined && <Notice kind={message.kind}>{displayMessage(message.text, t)}</Notice>}
      <form onSubmit={onOpen} className="stack" autoComplete="off">
        <Field label={t('stealthExport.open.file')}>{(id) => <>
          <input id={id} aria-describedby={recognized === undefined ? undefined : `${id}-file`} type="file" accept="application/json,.json" onChange={(e) => {
            const chosen = e.currentTarget.files?.[0]; e.currentTarget.value = '';
            if (chosen === undefined) return;
            selectFile(chosen);
          }} />
          {/* Main convention (07722292): the chosen file's name is not echoed back. */}
          {recognized !== undefined && <p className="hint" id={`${id}-file`}>{t('upload.selectedFile')}</p>}
        </>}</Field>
        {busy && recognized === undefined && <p role="status">{t('sellerKeys.verify.reading')}</p>}
        {recognized !== undefined && <p role="status">{t(RECOVERY_LABELS[recognized.kind])}</p>}
        {!canLoad && <Notice kind="info">{t('recoveryFile.loaded')}</Notice>}
        {needsPassphrase && <Field label={t(keystore ? 'sellerKeys.passphrase' : 'stealthExport.open.passphrase')} hint={t('stealthExport.open.passphraseHint')}>
          {(id, d) => <input id={id} aria-describedby={d} type="password" autoComplete="off" name="ghostpay-stealth-export-open" disabled={working} value={passphrase} onChange={(e) => { setPassphrase(e.target.value); setVerified(undefined); setMessage(undefined); }} />}
        </Field>}
        {canLoad && <button type="submit" className="btn" data-testid="stealth-export-open-submit" disabled={working || recognized === undefined || (keystore && passphrase === '')}>{t(keystore ? 'sellerKeys.decryptLoad' : 'stealthExport.open.submit')}</button>}
        {!keystore && recognized?.kind !== 'public' && <button type="button" className="btn" data-testid="stealth-export-verify-submit" disabled={working || recognized === undefined} onClick={() => { openSelected('verify'); }}>{t('stealthExport.open.verify')}</button>}
        {working && <button type="button" className="btn" onClick={() => { props.recovery?.cancelImport(); closeExport(); }}>{t('stealthExport.cancel')}</button>}
      </form>

      {verified !== undefined && (
        <div className="stack" data-testid="stealth-export-verified">
          {verified.kind === 'keypair' ? (
            <>
              <p>{t('stealthExport.open.keypair.summary', { count: verified.header.count, chain: chainLabel(verified.header.chainId, t), scope: t(SCOPE_KEYS[verified.header.scope]) })}</p>
              <ul className="plain-list">{verified.header.payments.map((record) => <li key={record.stealthAddress}><Mono>{record.stealthAddress}</Mono></li>)}</ul>
            </>
          ) : (
            <><p><Mono>{verified.header.metaAddress}</Mono></p><p>{t('stealthExport.verify.masterScope')}</p></>
          )}
        </div>
      )}

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
            <p><button type="button" className="btn btn-primary" disabled={busy || confirmReplace !== undefined} onClick={onLoadMaster}>{t('stealthExport.open.master.load')}</button></p>
          )}
          {confirmReplace !== undefined && (
            <div ref={confirmRef} tabIndex={-1} role="group" aria-label={t(confirmReplace === 'saved' ? 'stealthExport.open.replace.savedTitle' : 'stealthExport.open.replace.title')}>
              <Notice kind="warn" title={t(confirmReplace === 'saved' ? 'stealthExport.open.replace.savedTitle' : 'stealthExport.open.replace.title')}>
                <p>{t(confirmReplace === 'saved' ? 'stealthExport.open.replace.savedBody' : 'stealthExport.open.replace.body')}</p>
                <button type="button" className="btn btn-danger" disabled={busy} onClick={confirmInstall}>{t('stealthExport.open.replace.confirm')}</button>{' '}
                <button type="button" className="btn" onClick={() => { op.stop(); replacement.current = undefined; setBusy(false); setConfirmReplace(undefined); }}>{t('stealthExport.cancel')}</button>
              </Notice>
            </div>
          )}
        </div>
      )}

      {shown !== undefined && shown.kind !== 'public' && (
        <p><button type="button" className="btn" onClick={closeExport}>{t('stealthExport.open.close')}</button></p>
      )}
    </section>
  );
}

// i18n-use: stealthExport.open.scope.single stealthExport.open.scope.selected stealthExport.open.scope.allDiscovered stealthExport.open.chooseFile stealthExport.open.master.done stealthExport.open.working stealthExport.raw.done stealthExport.verify.success stealthExport.open.replace.savedTitle stealthExport.open.replace.savedBody stealthExport.open.replace.title stealthExport.open.replace.body

// i18n-use: recoveryFile.keystore recoveryFile.keypair recoveryFile.master
