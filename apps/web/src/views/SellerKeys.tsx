import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { CopyButton, Field, Mono, Notice, downloadText } from '../components/Common';
import { TagArchive } from '../components/TagArchive';
import { CameraImporter } from '../components/CameraImporter';
import { QrFrame } from '../components/QrFrame';
import { userMessage } from '../lib/errors';
import { MAX_KEYSTORE_BYTES, passphraseProblem, validateKeystoreEnvelope } from '../lib/keystore';
import { captureSessionVersionGuard, clearSession, exportKeystore, generateSession, getSessionPublic, importKeystore, importSession, type SessionPublic } from '../lib/session';
import { deleteEncryptedVault, readEncryptedVault, saveEncryptedVault, unlockEncryptedVault, VaultChangedError, VaultSavedForPreviousKeysError } from '../lib/keyVault';
import { useApp } from '../state';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';

export function SellerKeys(): ReactNode {
  const app = useApp();
  const i18n = useI18nOptional();
  const t = i18n?.t ?? SOURCE_TRANSLATOR.t;
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [spend, setSpend] = useState('');
  const [view, setViewKey] = useState('');
  const [signing, setSigning] = useState('');
  const [pass, setPass] = useState('');
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
  const [vaultSavePass, setVaultSavePass] = useState('');
  const [vaultSavePass2, setVaultSavePass2] = useState('');
  const [vaultUnlockPass, setVaultUnlockPass] = useState('');
  const [vaultBusy, setVaultBusy] = useState(false);
  // The exact ciphertext shown when deletion was requested; Confirm deletes only this record. Never plaintext keys.
  const [deleteExpected, setDeleteExpected] = useState<string | undefined>(undefined);
  const confirmVaultDelete = deleteExpected !== undefined;
  const saveOperation = useRef(0);

  useEffect(() => {
    let live = true;
    void readEncryptedVault().then(
      (saved) => { if (live) setVaultState(saved === undefined ? 'empty' : 'saved'); },
      () => { if (live) setVaultState('unavailable'); },
    );
    return () => { live = false; };
  }, []);

  // Reset the uncontrolled picker's FileList so the same file can be selected again (no change event otherwise).
  const resetFilePicker = (): void => {
    if (fileInput.current !== null) fileInput.current.value = '';
  };
  const stopOperation = (): void => {
    generation.current += 1; operation.current?.abort(); operation.current = null;
  };
  const cancelImport = (): void => {
    stopOperation();
    setBusy(false); setVaultBusy(false); setImportPass(''); setFile(undefined); setImportText(undefined); setVaultUnlockPass('');
    resetFilePicker();
  };
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; stopOperation(); };
  }, []);
  useEffect(() => {
    operation.current?.abort(); operation.current = null;
    setBackupQr(undefined); setBusy(false); setVaultBusy(false);
    setPass(''); setPass2(''); setImportPass(''); setVaultUnlockPass(''); setImportText(undefined); setFile(undefined);
    setVaultSavePass(''); setVaultSavePass2('');
    resetFilePicker();
  }, [app.session]);
  const startOperation = (): AbortController => {
    generation.current += 1;
    operation.current?.abort();
    const controller = new AbortController(); operation.current = controller; return controller;
  };
  const currentOperation = (controller: AbortController): boolean => mounted.current && operation.current === controller && !controller.signal.aborted;
  // Own completion: unmount, Cancel, file/password edits and newer operations bump `generation`; the app.session effect deliberately does not.
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
    setBusy(true);
    setMessage({ kind: 'ok', text: t('sellerKeys.encrypting') });
    exportKeystore(pass).then(
      (text) => {
        if (!currentOperation(controller)) return;
        try { unchanged(); } catch (error) { setBusy(false); fail(error); return; }
        downloadText('ghostpay-keystore.json', text, 'application/json');
        setBackupQr(text);
        setPass('');
        setPass2('');
        setBusy(false);
        done(t('sellerKeys.keystoreDownloaded'));
      },
      (err: unknown) => {
        if (!currentOperation(controller)) return;
        setBusy(false);
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
    void saveEncryptedVault(vaultSavePass).then(
      () => {
        if (!current()) return;
        setVaultSavePass('');
        setVaultSavePass2('');
        setVaultState('saved');
        setVaultBusy(false);
        try { unchanged(); } catch { fail(new VaultSavedForPreviousKeysError()); return; }
        done(t('sellerKeys.vaultSaved'));
      },
      (err: unknown) => {
        if (!current()) return;
        setVaultBusy(false);
        if (err instanceof VaultSavedForPreviousKeysError) { setVaultSavePass(''); setVaultSavePass2(''); setVaultState('saved'); }
        fail(err);
      },
    );
  };

  const onUnlockVault = (e: FormEvent): void => {
    e.preventDefault();
    const controller = startOperation();
    const id = generation.current;
    setVaultBusy(true);
    void unlockEncryptedVault(vaultUnlockPass, undefined, controller.signal).then(
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

  const refreshVault = (): void => {
    void readEncryptedVault().then(
      (saved) => { if (mounted.current) setVaultState(saved === undefined ? 'empty' : 'saved'); },
      () => { if (mounted.current) setVaultState('unavailable'); },
    );
  };

  const onRequestDeleteVault = (): void => {
    void readEncryptedVault().then(
      (saved) => {
        if (!mounted.current) return;
        if (saved === undefined) { setVaultState('empty'); return; }
        setDeleteExpected(saved);
      },
      (err: unknown) => { if (mounted.current) fail(err); },
    );
  };

  const onDeleteVault = (): void => {
    const expected = deleteExpected;
    if (expected === undefined) return;
    setVaultBusy(true);
    void deleteEncryptedVault(expected).then(
      () => {
        if (!mounted.current) return;
        setDeleteExpected(undefined);
        setVaultState('empty');
        setVaultBusy(false);
        refreshVault();
        done(t('sellerKeys.vaultDeleted'));
      },
      (err: unknown) => {
        if (!mounted.current) return;
        setVaultBusy(false);
        if (err instanceof VaultChangedError) { setDeleteExpected(undefined); refreshVault(); }
        fail(err);
      },
    );
  };

  const s = app.session;
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
            <Field label={t('sellerKeys.vaultPassphrase')}>{(id) => <input id={id} type="password" autoComplete="current-password" value={vaultUnlockPass} onChange={(e) => { if (vaultBusy) { stopOperation(); setVaultBusy(false); } setVaultUnlockPass(e.target.value); }} />}</Field>
            <button type="submit" className="btn" disabled={vaultBusy || vaultUnlockPass === ''}>{t('sellerKeys.unlockVault')}</button>
            {vaultBusy && operation.current !== null && <button type="button" className="btn" onClick={cancelImport}>{t('sellerKeys.cancelUnlock')}</button>}
          </form>
          {!confirmVaultDelete ? (
            <button type="button" className="btn btn-danger" disabled={vaultBusy} onClick={onRequestDeleteVault}>{t('sellerKeys.deleteVault')}</button>
          ) : (
            <div>
              <p>{t('sellerKeys.deleteExplain')}</p>
              <button type="button" className="btn btn-danger" disabled={vaultBusy} onClick={onDeleteVault}>{t('sellerKeys.confirmDelete')}</button>{' '}
              <button type="button" className="btn" onClick={() => { setDeleteExpected(undefined); }}>{t('sellerKeys.cancel')}</button>
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
              <Field label={t('sellerKeys.keystoreFile')}>{(id) => <input id={id} ref={fileInput} type="file" accept="application/json,.json" onChange={(e) => {
                // Capture the new selection first; cancel stale work without clearing the picker that holds it.
                const chosen = e.target.files?.[0];
                stopOperation();
                setBusy(false); setVaultBusy(false); setImportPass(''); setImportText(undefined); setVaultUnlockPass('');
                setFile(chosen);
              }} />}</Field>
              <Field label={t('sellerKeys.passphrase')}>{(id) => <input id={id} type="password" autoComplete="off" value={importPass} onChange={(e) => { if (busy) { stopOperation(); setBusy(false); } setImportPass(e.target.value); }} />}</Field>
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
          <p>{t('sellerKeys.metaShare')}</p>
          <p><Mono>{s.metaAddress}</Mono></p>
          <QrFrame kind="shareable" text={s.metaAddress} caption={t('sellerKeys.metaCaption')} />
          <p><CopyButton text={s.metaAddress} label={t('sellerKeys.copyMeta')} /></p>
          <h3>{t('sellerKeys.signingKeyHeading')}</h3>
          <p><Mono>{s.signerPublicKey}</Mono></p>
          <p className="hint">{t('sellerKeys.payersSee')}</p>

          <h3>{t('sellerKeys.backupHeading')}</h3>
          <form onSubmit={onExport} className="stack" autoComplete="off">
            <Field label={t('sellerKeys.passphraseMin')}>{(id) => <input id={id} type="password" autoComplete="new-password" value={pass} onChange={(e) => { setPass(e.target.value); }} />}</Field>
            <Field label={t('sellerKeys.repeatPassphrase')}>{(id) => <input id={id} type="password" autoComplete="new-password" value={pass2} onChange={(e) => { setPass2(e.target.value); }} />}</Field>
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
                <Field label={t('sellerKeys.newVaultPass')}>{(id) => <input id={id} type="password" autoComplete="new-password" value={vaultSavePass} onChange={(e) => { setVaultSavePass(e.target.value); }} />}</Field>
                <Field label={t('sellerKeys.repeatVaultPass')}>{(id) => <input id={id} type="password" autoComplete="new-password" value={vaultSavePass2} onChange={(e) => { setVaultSavePass2(e.target.value); }} />}</Field>
                <button type="submit" className="btn" disabled={vaultBusy}>{t('sellerKeys.saveVault')}</button>
              </form>
            ) : vaultState === 'saved' ? (
              <p>{t('sellerKeys.vaultExists')}</p>
            ) : vaultState === 'unavailable' ? null : <p role="status">{t('sellerKeys.checkingAvailability')}</p>}
          </section>

          <h3>{t('sellerKeys.forgetHeading')}</h3>
          <button type="button" className="btn btn-danger" onClick={() => { clearSession(); setBackupQr(undefined); app.announce(t('sellerKeys.wiped')); setMessage({ kind: 'ok', text: t('sellerKeys.wiped') }); }}>
            {t('sellerKeys.wipe')}
          </button>
        </>
      )}

      <TagArchive />

      <h3>{t('sellerKeys.registryHeading')}</h3>
      <p className="hint">{t('sellerKeys.registryHint')}</p>
      <p><button type="button" className="btn" onClick={() => { app.setView('registry'); }}>{t('sellerKeys.openRegistry')}</button></p>
    </section>
  );
}
