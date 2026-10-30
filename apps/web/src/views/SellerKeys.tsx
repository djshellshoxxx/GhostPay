import { subscribeAppLock } from '../lib/appLock';
import { useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react';
import { CopyButton, Field, Mono, Notice, downloadText } from '../components/Common';
import { TagArchive } from '../components/TagArchive';
import { CameraImporter } from '../components/CameraImporter';
import { QrFrame } from '../components/QrFrame';
import { userMessage } from '../lib/errors';
import { GENERATED_PASSPHRASE_BITS, GENERATED_PASSPHRASE_WORDS, generatePassphrase, MAX_KEYSTORE_BYTES, passphraseProblem, validateKeystoreEnvelope } from '../lib/keystore';
import { captureSessionVersionGuard, clearSession, exportKeystore, generateSession, getSessionBackup, getSessionPublic, importKeystore, importSession, markKeystoreDownloaded, sessionHasExternalCopy, subscribeSessionBackup, waiveSessionBackup, type SessionPublic } from '../lib/session';
import { authorizeKeyExport, deleteEncryptedVault, loadedKeysRecoverable, readEncryptedVault, saveEncryptedVault, unlockEncryptedVault, VaultChangedError, vaultMetaAddress, VaultSavedForPreviousKeysError } from '../lib/keyVault';
import { useApp } from '../state';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';

/**
 * Stands in for `children` (the meta-address, an invoice form, a whole view) while the loaded keys have no backup and the
 * seller has not typed the waiver (L1-01): every payment those invite is lost if the tab closes before a backup exists.
 * When only the signing key generated at a hex import is unsaved, payments stay sweepable from that hex: `paymentsOnly`
 * children, which sign nothing, are shown, and the gate in front of the rest says that only the signing key is at stake
 * (C-R10). The app-wide backup banner above it offers "Back up now". `heading` keeps the title of a view it stands in for.
 */
export function BackupGate(props: { readonly children: ReactNode; readonly heading?: string; readonly paymentsOnly?: boolean }): ReactNode {
  const app = useApp();
  const i18n = useI18nOptional();
  const t = i18n?.t ?? SOURCE_TRANSLATOR.t;
  const backup = useSyncExternalStore(subscribeSessionBackup, getSessionBackup);
  const [typed, setTyped] = useState('');
  const headingId = useId();
  useEffect(() => { setTyped(''); }, [app.session]);
  if (backup === undefined || backup.backedUp || backup.waived || (backup.signerOnly && props.paymentsOnly === true)) return props.children;
  const phrase = t('backupGate.waiverPhrase');
  const gate = (
    <div className="panel">
      <Notice kind="warn" title={t('backupGate.title')}>{backup.signerOnly ? t('backupGate.signerOnly.body') : t('backupGate.body')}</Notice>
      <Field label={t('backupGate.waiverLabel', { phrase })}>{(id) => <input id={id} autoComplete="off" spellCheck={false} value={typed} onChange={(e) => { setTyped(e.target.value); }} />}</Field>
      <button type="button" className="btn" disabled={typed.trim().toLowerCase() !== phrase.toLowerCase()} onClick={() => { waiveSessionBackup(); }}>{t('backupGate.waive')}</button>
    </div>
  );
  return props.heading === undefined ? gate : (
    <section aria-labelledby={headingId}>
      <h2 id={headingId}>{props.heading}</h2>
      {gate}
    </section>
  );
}

export function SellerKeys(): ReactNode {
  const app = useApp();
  const i18n = useI18nOptional();
  const t = i18n?.t ?? SOURCE_TRANSLATOR.t;
  const backup = useSyncExternalStore(subscribeSessionBackup, getSessionBackup);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [spend, setSpend] = useState('');
  const [view, setViewKey] = useState('');
  const [signing, setSigning] = useState('');
  // New passphrases start as a generated suggestion (L1-06), shown in clear only while untouched.
  const [suggestedPass, setSuggestedPass] = useState(generatePassphrase);
  const [pass, setPass] = useState(suggestedPass);
  const [pass2, setPass2] = useState('');
  const [importPass, setImportPass] = useState('');
  const [importText, setImportText] = useState<string | undefined>();
  const operation = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const generation = useRef(0);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | undefined>(undefined);
  const [backupQr, setBackupQr] = useState<string | undefined>(undefined);
  const [vaultState, setVaultState] = useState<'checking' | 'empty' | 'saved' | 'unavailable'>('checking');
  // Public meta-address named by the saved vault, if it is a readable keystore.
  const [vaultMeta, setVaultMeta] = useState<string | undefined>(undefined);
  const [suggestedVaultPass, setSuggestedVaultPass] = useState(generatePassphrase);
  const [vaultSavePass, setVaultSavePass] = useState(suggestedVaultPass);
  const [vaultSavePass2, setVaultSavePass2] = useState('');
  const [vaultUnlockPass, setVaultUnlockPass] = useState('');
  const [vaultBusy, setVaultBusy] = useState(false);
  // Step-up passphrases of the vault the loaded keys are tied to (L1-02), and the delete confirmation's passphrase.
  const [exportStepUp, setExportStepUp] = useState('');
  const [saveStepUp, setSaveStepUp] = useState('');
  const [deletePass, setDeletePass] = useState('');
  // Unlocking would replace keys that have no backup; set once the user asked to unlock anyway (L1-01).
  const [confirmReplace, setConfirmReplace] = useState(false);
  // Wiping would lose keys that have no backup; set once the user asked to wipe them anyway (C-R4).
  const [confirmWipe, setConfirmWipe] = useState(false);
  // The exact ciphertext shown when deletion was requested; Confirm deletes only this record. Never plaintext keys.
  const [deleteExpected, setDeleteExpected] = useState<string | undefined>(undefined);
  const confirmVaultDelete = deleteExpected !== undefined;
  const saveOperation = useRef(0);

  // Read again for every key change: a saved vault for the keys loaded now arms their step-up (L1-02).
  useEffect(() => {
    let live = true;
    void readEncryptedVault().then(
      (saved) => { if (live) { setVaultState(saved === undefined ? 'empty' : 'saved'); setVaultMeta(saved === undefined ? undefined : vaultMetaAddress(saved)); } },
      () => { if (live) setVaultState('unavailable'); },
    );
    return () => { live = false; };
  }, [app.session]);

  const resetFilePicker = (): void => {
    if (fileInput.current !== null) fileInput.current.value = '';
  };
  const stopOperation = (): void => {
    generation.current += 1;
    operation.current?.abort(); operation.current = null;
  };
  const clearImport = (): void => {
    stopOperation();
    setBusy(false); setVaultBusy(false); setImportPass(''); setFile(undefined); setImportText(undefined); setVaultUnlockPass('');
  };
  const cancelImport = (): void => {
    clearImport();
    resetFilePicker();
  };
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; stopOperation(); };
  }, []);
  const suggestPass = (): void => { const next = generatePassphrase(); setSuggestedPass(next); setPass(next); setPass2(''); };
  const suggestVaultPass = (): void => { const next = generatePassphrase(); setSuggestedVaultPass(next); setVaultSavePass(next); setVaultSavePass2(''); };
  const suggestedHint = t('sellerKeys.suggested', { words: GENERATED_PASSPHRASE_WORDS, bits: GENERATED_PASSPHRASE_BITS });
  // Key hex and passphrases typed here go with every key change and at every idle lock, also while unsaved keys stay
  // loaded: react-dom mirrors a controlled input's value into its value attribute (G2-05, KL-26).
  const forgetTyped = (): void => {
    setSpend(''); setViewKey(''); setSigning('');
    suggestPass(); suggestVaultPass(); setImportPass(''); setVaultUnlockPass('');
    setExportStepUp(''); setSaveStepUp(''); setDeletePass('');
  };
  useEffect(() => subscribeAppLock(forgetTyped), []);
  useEffect(() => {
    operation.current?.abort(); operation.current = null;
    setBackupQr(undefined); setBusy(false); setVaultBusy(false);
    forgetTyped(); setImportText(undefined); setFile(undefined);
    resetFilePicker();
    setConfirmReplace(false); setConfirmWipe(false); setDeleteExpected(undefined);
  }, [app.session]);
  const startOperation = (): AbortController => {
    stopOperation();
    const controller = new AbortController(); operation.current = controller; return controller;
  };
  const currentOperation = (controller: AbortController): boolean => mounted.current && operation.current === controller && !controller.signal.aborted;
  // Installing our own keys triggers the session effect above. Only explicit cancellation, edits or another operation
  // revoke this completion; a new session, even with identical public keys, has a different summary object.
  const ownCompletion = (id: number, installed: SessionPublic): boolean =>
    mounted.current && generation.current === id && getSessionPublic() === installed;

  const fail = (e: unknown): void => {
    setMessage({ kind: 'error', text: userMessage(e) });
  };
  const done = (text: string): void => {
    setMessage({ kind: 'ok', text });
    app.announce(text);
  };

  const onImportRaw = (e: FormEvent): void => {
    e.preventDefault();
    try {
      importSession({ spendingKeyHex: spend, viewingKeyHex: view, ...(signing.trim() === '' ? {} : { signingKeyHex: signing }) });
      setSpend('');
      setViewKey('');
      setSigning('');
      done(t('sellerKeys.loaded'));
    } catch (err) {
      // A failed import must not leave the typed keys behind either (G2-05).
      setSpend('');
      setViewKey('');
      setSigning('');
      fail(err);
    }
  };

  const onExport = (e: FormEvent): void => {
    e.preventDefault();
    const problem = passphraseProblem(pass);
    if (problem !== undefined) {
      setMessage({ kind: 'error', text: problem });
      return;
    }
    if (pass !== pass2) {
      setMessage({ kind: 'error', text: t('sellerKeys.passphrasesDiffer') });
      return;
    }
    const controller = startOperation();
    const unchanged = captureSessionVersionGuard();
    const stepUp = exportStepUp;
    setBusy(true);
    setMessage({ kind: 'ok', text: t('sellerKeys.encrypting') });
    void (async () => {
      // Keys tied to a vault leave this tab only with that vault's passphrase (L1-02).
      await authorizeKeyExport(stepUp);
      return exportKeystore(pass);
    })().then(
      (text) => {
        if (!currentOperation(controller)) return;
        try { unchanged(); } catch (error) { setBusy(false); fail(error); return; }
        downloadText('ghostpay-keystore.json', text, 'application/json');
        // A downloaded keystore is a copy outside this tab: the idle lock may wipe these keys from now on (L1-01).
        markKeystoreDownloaded(unchanged);
        setBackupQr(text);
        setPass('');
        setPass2('');
        setExportStepUp('');
        setBusy(false);
        done(t('sellerKeys.keystoreDownloaded'));
      },
      (err: unknown) => {
        if (!currentOperation(controller)) return;
        setExportStepUp('');
        setBusy(false);
        // A vault saved meanwhile (another tab) may be why the step-up was needed: show its field.
        refreshVault();
        fail(err);
      },
    );
  };

  const onImportKeystore = (e: FormEvent): void => {
    e.preventDefault();
    if (file === undefined && importText === undefined) { setMessage({ kind: 'error', text: t('sellerKeys.chooseFile') }); return; }
    if (file !== undefined && file.size > MAX_KEYSTORE_BYTES) { setMessage({ kind: 'error', text: t('sellerKeys.notKeystore') }); return; }
    const controller = startOperation();
    const id = generation.current;
    const unchanged = captureSessionVersionGuard();
    const selected = file; const pasted = importText; const passphrase = importPass;
    setBusy(true); setMessage({ kind: 'ok', text: t('sellerKeys.decrypting') });
    void (async () => {
      try {
        const text = selected === undefined ? pasted! : await selected.text();
        if (!currentOperation(controller)) return;
        unchanged();
        const installed = await importKeystore(text, passphrase, controller.signal);
        if (!ownCompletion(id, installed)) return;
        setImportPass(''); setFile(undefined); setImportText(undefined); setBusy(false);
        done(t('sellerKeys.keystoreDecrypted'));
      } catch (error) {
        if (!currentOperation(controller)) return;
        setImportPass(''); setBusy(false); fail(error);
      }
    })();
  };

  const onSaveVault = (e: FormEvent): void => {
    e.preventDefault();
    const problem = passphraseProblem(vaultSavePass);
    if (problem !== undefined) { setMessage({ kind: 'error', text: problem }); return; }
    if (vaultSavePass !== vaultSavePass2) { setMessage({ kind: 'error', text: t('sellerKeys.passphrasesDiffer') }); return; }
    const id = ++saveOperation.current;
    const unchanged = captureSessionVersionGuard();
    // Only the initiating save may report; it may claim success only for the keys that were loaded when it started.
    const current = (): boolean => mounted.current && saveOperation.current === id;
    setVaultBusy(true);
    const stepUp = saveStepUp;
    void saveEncryptedVault(vaultSavePass, {}, undefined, stepUp).then(
      () => {
        if (!current()) return;
        setVaultSavePass('');
        setVaultSavePass2('');
        setSaveStepUp('');
        setVaultState('saved');
        setVaultBusy(false);
        try { unchanged(); } catch { fail(new VaultSavedForPreviousKeysError()); return; }
        refreshVault();
        done(t('sellerKeys.vaultSaved'));
      },
      (err: unknown) => {
        if (!current()) return;
        setVaultBusy(false);
        setSaveStepUp('');
        if (err instanceof VaultSavedForPreviousKeysError) { setVaultSavePass(''); setVaultSavePass2(''); setVaultState('saved'); }
        refreshVault();
        fail(err);
      },
    );
  };

  const onUnlockVault = (e: FormEvent): void => {
    e.preventDefault();
    // Unlocking replaces the loaded keys; keys with no backup would be lost with every payment to them (L1-01). As for a
    // wipe, a vault copy is looked up in storage first, because another tab may have deleted or replaced it since this page
    // last read it (C-R12). A key change during that read drops the request.
    if (getSessionBackup() === undefined || sessionHasExternalCopy()) { unlockVault(false); return; }
    const unchanged = captureSessionVersionGuard();
    void loadedKeysRecoverable().then((recoverable) => {
      if (!mounted.current) return;
      try { unchanged(); } catch { return; }
      if (recoverable) unlockVault(false); else setConfirmReplace(true);
    });
  };

  const unlockVault = (replaceUnsavedKeys: boolean): void => {
    const controller = startOperation();
    const id = generation.current;
    setConfirmReplace(false);
    setVaultBusy(true);
    void unlockEncryptedVault(vaultUnlockPass, undefined, controller.signal, { replaceUnsavedKeys }).then(
      (installed) => {
        if (!ownCompletion(id, installed)) return;
        setVaultUnlockPass('');
        setBackupQr(undefined);
        setVaultBusy(false);
        done(t('sellerKeys.vaultUnlocked'));
      },
      (err: unknown) => {
        if (!currentOperation(controller)) return;
        setVaultUnlockPass('');
        setVaultBusy(false);
        fail(err);
      },
    );
  };

  const onWipe = (): void => {
    // Keys with no backup exist only here, and every payment to them would be lost with them (L1-01). A copy outside this
    // browser survives the wipe; a vault copy is looked up in storage first, because another tab may have deleted it since
    // this page last read it (C-R9). A key change during that read drops the request.
    if (sessionHasExternalCopy()) { wipe(); return; }
    const unchanged = captureSessionVersionGuard();
    void loadedKeysRecoverable().then((recoverable) => {
      if (!mounted.current) return;
      try { unchanged(); } catch { return; }
      if (recoverable) wipe(); else setConfirmWipe(true);
    });
  };

  const wipe = (): void => {
    setConfirmWipe(false);
    clearSession();
    setBackupQr(undefined);
    app.announce(t('sellerKeys.wiped'));
    setMessage({ kind: 'ok', text: t('sellerKeys.wiped') });
  };

  const refreshVault = (): void => {
    void readEncryptedVault().then(
      (saved) => { if (mounted.current) { setVaultState(saved === undefined ? 'empty' : 'saved'); setVaultMeta(saved === undefined ? undefined : vaultMetaAddress(saved)); } },
      () => { if (mounted.current) setVaultState('unavailable'); },
    );
  };

  const onRequestDeleteVault = (): void => {
    void readEncryptedVault().then(
      (saved) => {
        if (!mounted.current) return;
        if (saved === undefined) { setVaultState('empty'); return; }
        setDeletePass('');
        setDeleteExpected(saved);
      },
      (err: unknown) => { if (mounted.current) fail(err); },
    );
  };

  const onDeleteVault = (): void => {
    const expected = deleteExpected;
    if (expected === undefined) return;
    const passphrase = deletePass;
    setVaultBusy(true);
    void deleteEncryptedVault(expected, undefined, passphrase).then(
      () => {
        if (!mounted.current) return;
        setDeleteExpected(undefined);
        setDeletePass('');
        setVaultState('empty');
        setVaultBusy(false);
        refreshVault();
        done(t('sellerKeys.vaultDeleted'));
      },
      (err: unknown) => {
        if (!mounted.current) return;
        setVaultBusy(false);
        setDeletePass('');
        if (err instanceof VaultChangedError) { setDeleteExpected(undefined); refreshVault(); }
        fail(err);
      },
    );
  };

  const s = app.session;
  // Keys tied to a vault, or with a saved vault for the same meta-address, need its passphrase to be exported (L1-02).
  const stepUpNeeded = backup?.vaultStepUp === true || (s !== undefined && vaultState === 'saved' && vaultMeta === s.metaAddress);
  const deleteMeta = deleteExpected === undefined ? undefined : vaultMetaAddress(deleteExpected);
  const deletesLoadedKeys = s !== undefined && deleteMeta === s.metaAddress;
  return (
    <section aria-labelledby="keys-h">
      <h2 id="keys-h">{t('sellerKeys.title')}</h2>
      <Notice kind="info" title={t('sellerKeys.memory.title')}>
        {t('sellerKeys.memory.body')}
      </Notice>
      {message !== undefined && <Notice kind={message.kind}>{message.text}</Notice>}
      {vaultState === 'checking' && <p role="status">{t('sellerKeys.checkingVault')}</p>}
      {vaultState === 'unavailable' && (
        <Notice kind="warn" title={t('sellerKeys.storageUnavailable.title')}>
          {t('sellerKeys.storageUnavailable.body')}
        </Notice>
      )}
      {vaultState === 'saved' && (
        <section className="panel" aria-labelledby="vault-unlock-h">
          <h3 id="vault-unlock-h">{t('sellerKeys.vaultSavedHeading')}</h3>
          <p>{t('sellerKeys.unlockExplain')}</p>
          <form onSubmit={onUnlockVault} className="stack" autoComplete="off">
            <Field label={t('sellerKeys.vaultPassphrase')} hint={t('sellerKeys.vaultNoBrowserSave')}>{(id, d) => <input id={id} aria-describedby={d} type="password" autoComplete="off" name="ghostpay-vault-unlock" value={vaultUnlockPass} onChange={(e) => { stopOperation(); setVaultBusy(false); setConfirmReplace(false); setVaultUnlockPass(e.target.value); }} />}</Field>
            <button type="submit" className="btn" disabled={vaultBusy || vaultUnlockPass === ''}>{t('sellerKeys.unlockVault')}</button>
            {vaultBusy && operation.current !== null && <button type="button" className="btn" onClick={cancelImport}>{t('sellerKeys.cancelUnlock')}</button>}
          </form>
          {confirmReplace && (
            <Notice kind="warn" title={backup?.signerOnly === true ? t('sellerKeys.unlockReplacesSignerOnly.title') : t('sellerKeys.unlockReplaces.title')}>
              <p>{backup?.signerOnly === true ? t('sellerKeys.unlockReplacesSignerOnly.body') : t('sellerKeys.unlockReplaces.body')}</p>
              <button type="button" className="btn btn-danger" disabled={vaultBusy} onClick={() => { unlockVault(true); }}>{t('sellerKeys.unlockReplaces.confirm')}</button>{' '}
              <button type="button" className="btn" onClick={() => { setConfirmReplace(false); }}>{t('sellerKeys.cancel')}</button>
            </Notice>
          )}
          {!confirmVaultDelete ? (
            <button type="button" className="btn btn-danger" disabled={vaultBusy} onClick={onRequestDeleteVault}>{t('sellerKeys.deleteVault')}</button>
          ) : (
            <div>
              <p>{t('sellerKeys.deleteExplain')}</p>
              {deleteMeta === undefined ? <p>{t('sellerKeys.deleteUnreadable')}</p> : (
                <>
                  <p>{t('sellerKeys.deleteHolds')}</p>
                  <p><Mono>{deleteMeta}</Mono></p>
                  {s !== undefined && <p>{t(deletesLoadedKeys ? 'sellerKeys.deleteLoaded' : 'sellerKeys.deleteOther')}</p>}
                </>
              )}
              {deletesLoadedKeys && (
                <Field label={t('sellerKeys.deletePassphrase')}>{(id) => <input id={id} type="password" autoComplete="off" name="ghostpay-vault-delete" value={deletePass} onChange={(e) => { setDeletePass(e.target.value); }} />}</Field>
              )}
              <button type="button" className="btn btn-danger" disabled={vaultBusy || (deletesLoadedKeys && deletePass === '')} onClick={onDeleteVault}>{t('sellerKeys.confirmDelete')}</button>{' '}
              <button type="button" className="btn" onClick={() => { setDeleteExpected(undefined); setDeletePass(''); }}>{t('sellerKeys.cancel')}</button>
            </div>
          )}
        </section>
      )}

      {s === undefined ? (
        <>
          <p>
            <button type="button" className="btn btn-primary" onClick={() => { try { generateSession(); done(t('sellerKeys.generated')); } catch (err) { fail(err); } }}>
              {t('sellerKeys.generate')}
            </button>
          </p>
          <details onToggle={(event) => { if (!event.currentTarget.open) { setSpend(''); setViewKey(''); setSigning(''); } }}>
            <summary>{t('sellerKeys.importHex')}</summary>
            <form onSubmit={onImportRaw} className="stack" autoComplete="off">
              <Field label={t('sellerKeys.spendKey')}>{(id) => <input id={id} type="password" autoComplete="off" spellCheck={false} value={spend} onChange={(e) => { setSpend(e.target.value); }} />}</Field>
              <Field label={t('sellerKeys.viewKey')}>{(id) => <input id={id} type="password" autoComplete="off" spellCheck={false} value={view} onChange={(e) => { setViewKey(e.target.value); }} />}</Field>
              <Field label={t('sellerKeys.signKey.label')} hint={t('sellerKeys.signKey.hint')}>
                {(id, d) => <input id={id} aria-describedby={d} type="password" autoComplete="off" spellCheck={false} value={signing} onChange={(e) => { setSigning(e.target.value); }} />}
              </Field>
              <button type="submit" className="btn">{t('sellerKeys.loadKeys')}</button>
            </form>
          </details>
          <details onToggle={(event) => { if (!event.currentTarget.open) cancelImport(); }}>
            <summary>{t('sellerKeys.importKeystore')}</summary>
            <form onSubmit={onImportKeystore} className="stack">
              <Field label={t('sellerKeys.keystoreFile')}>{(id) => <input id={id} ref={fileInput} type="file" accept="application/json,.json" onChange={(e) => { const chosen = e.currentTarget.files?.[0]; clearImport(); setFile(chosen); }} />}</Field>
              <Field label={t('sellerKeys.passphrase')}>{(id) => <input id={id} type="password" autoComplete="off" value={importPass} onChange={(e) => { stopOperation(); setBusy(false); setImportPass(e.target.value); }} />}</Field>
              <button type="submit" className="btn" disabled={busy}>{t('sellerKeys.decryptLoad')}</button>
              {busy && <button type="button" className="btn" onClick={cancelImport}>{t('sellerKeys.cancelKeystore')}</button>}
            </form>
            <CameraImporter label={t('sellerKeys.importKeystoreQr')} scopeKey={app.session} onInputChange={cancelImport} onText={(text, signal) => {
              validateKeystoreEnvelope(text);
              if (signal.aborted) return false;
              cancelImport(); setImportText(text); setMessage({ kind: 'ok', text: t('sellerKeys.keystoreReceived') }); return true;
            }} />
          </details>
        </>
      ) : (
        <>
          <h3>{t('sellerKeys.metaHeading')}</h3>
          <BackupGate paymentsOnly>
            <p>{t('sellerKeys.metaShare')}</p>
            <p><Mono>{s.metaAddress}</Mono></p>
            <QrFrame kind="shareable" text={s.metaAddress} caption={t('sellerKeys.metaCaption')} />
            <p><CopyButton text={s.metaAddress} label={t('sellerKeys.copyMeta')} /></p>
          </BackupGate>
          <h3>{t('sellerKeys.signingKeyHeading')}</h3>
          <p><Mono>{s.signerPublicKey}</Mono></p>
          <p className="hint">{t('sellerKeys.payersSee')}</p>

          <h3>{t('sellerKeys.backupHeading')}</h3>
          <form onSubmit={onExport} className="stack" autoComplete="off">
            <Field label={t('sellerKeys.passphraseMin')} {...(pass !== '' && pass === suggestedPass ? { hint: suggestedHint } : {})}>
              {(id, d) => <input id={id} aria-describedby={d} type={pass !== '' && pass === suggestedPass ? 'text' : 'password'} autoComplete="new-password" spellCheck={false} value={pass} onChange={(e) => { setPass(e.target.value); }} />}
            </Field>
            <p><button type="button" className="btn" onClick={suggestPass}>{t('sellerKeys.suggestAnother')}</button></p>
            <Field label={t('sellerKeys.repeatPassphrase')}>{(id) => <input id={id} type="password" autoComplete="new-password" value={pass2} onChange={(e) => { setPass2(e.target.value); }} />}</Field>
            {stepUpNeeded && (
              <Field label={t('sellerKeys.stepUp.label')} hint={t('sellerKeys.stepUp.hint')}>
                {(id, d) => <input id={id} aria-describedby={d} type="password" autoComplete="off" name="ghostpay-step-up-export" value={exportStepUp} onChange={(e) => { setExportStepUp(e.target.value); }} />}
              </Field>
            )}
            <button type="submit" className="btn" disabled={busy}>{t('sellerKeys.downloadKeystore')}</button>
          </form>
          <p className="hint">{t('sellerKeys.formatNote')}</p>
          {backupQr !== undefined && (
            <>
              <QrFrame kind="secret" text={backupQr} caption={t('sellerKeys.backupCaption')} />
              <button type="button" className="btn" onClick={() => { setBackupQr(undefined); }}>{t('sellerKeys.forgetQr')}</button>
            </>
          )}

          <section className="panel" aria-labelledby="vault-save-h">
            <h3 id="vault-save-h">{t('sellerKeys.vaultOptionalHeading')}</h3>
            <p>
              {t('sellerKeys.vaultExplain')}
            </p>
            {vaultState === 'empty' ? (
              <form onSubmit={onSaveVault} className="stack" autoComplete="off">
                <Field label={t('sellerKeys.newVaultPass')} hint={vaultSavePass !== '' && vaultSavePass === suggestedVaultPass ? `${suggestedHint} ${t('sellerKeys.vaultNoBrowserSave')}` : t('sellerKeys.vaultNoBrowserSave')}>
                  {(id, d) => <input id={id} aria-describedby={d} type={vaultSavePass !== '' && vaultSavePass === suggestedVaultPass ? 'text' : 'password'} autoComplete="off" name="ghostpay-vault-new" spellCheck={false} value={vaultSavePass} onChange={(e) => { setVaultSavePass(e.target.value); }} />}
                </Field>
                <p><button type="button" className="btn" onClick={suggestVaultPass}>{t('sellerKeys.suggestAnotherVault')}</button></p>
                <Field label={t('sellerKeys.repeatVaultPass')}>{(id) => <input id={id} type="password" autoComplete="off" name="ghostpay-vault-new-again" value={vaultSavePass2} onChange={(e) => { setVaultSavePass2(e.target.value); }} />}</Field>
                {backup?.vaultStepUp === true && (
                  <Field label={t('sellerKeys.stepUp.label')} hint={t('sellerKeys.stepUp.hint')}>
                    {(id, d) => <input id={id} aria-describedby={d} type="password" autoComplete="off" name="ghostpay-step-up-vault-save" value={saveStepUp} onChange={(e) => { setSaveStepUp(e.target.value); }} />}
                  </Field>
                )}
                <button type="submit" className="btn" disabled={vaultBusy}>{t('sellerKeys.saveVault')}</button>
              </form>
            ) : vaultState === 'saved' ? (
              <p>{t('sellerKeys.vaultExists')}</p>
            ) : vaultState === 'unavailable' ? null : <p role="status">{t('sellerKeys.checkingAvailability')}</p>}
          </section>

          <h3>{t('sellerKeys.forgetHeading')}</h3>
          <button type="button" className="btn btn-danger" onClick={onWipe}>
            {t('sellerKeys.wipe')}
          </button>
          {confirmWipe && (
            // The typed hex still sweeps payments when only the signing key generated for it is unsaved (C-R10).
            <Notice kind="warn" title={backup?.signerOnly === true ? t('sellerKeys.wipeSignerOnly.title') : t('sellerKeys.wipeUnsaved.title')}>
              <p>{backup?.signerOnly === true ? t('sellerKeys.wipeSignerOnly.body') : t('sellerKeys.wipeUnsaved.body')}</p>
              <button type="button" className="btn btn-danger" onClick={wipe}>{t('sellerKeys.wipeUnsaved.confirm')}</button>{' '}
              <button type="button" className="btn" onClick={() => { setConfirmWipe(false); }}>{t('sellerKeys.cancel')}</button>
            </Notice>
          )}
          {/* Local scan state is keyed by a hash of the public keys and outlives the wipe (audit I-1). */}
          <p className="hint">{t('sellerKeys.wipeHint')}</p>
        </>
      )}

      <TagArchive />

      <h3>{t('sellerKeys.registryHeading')}</h3>
      <p className="hint">{t('sellerKeys.registryHint')}</p>
      <p><button type="button" className="btn" onClick={() => { app.setView('registry'); }}>{t('sellerKeys.openRegistry')}</button></p>
    </section>
  );
}
