import { subscribeAppLock } from '../lib/appLock';
import { useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react';
import { CopyButton, Field, Mono, Notice, SafeText, downloadText } from '../components/Common';
import { CameraImporter } from '../components/CameraImporter';
import { QrFrame } from '../components/QrFrame';
import { displayMessage, captureUserMessage, type DisplayMessage } from '../lib/errors';
import { GENERATED_PASSPHRASE_BITS, GENERATED_PASSPHRASE_WORDS, generatePassphrase, MAX_KEYSTORE_BYTES, passphraseProblemMessage, validateKeystoreEnvelope } from '../lib/keystore';
import { captureSessionVersionGuard, clearSession, exportKeystore, generateSession, getSessionBackup, getSessionPublic, importKeystore, importSession, markKeystoreDownloaded, sessionHasExternalCopy, subscribeSessionBackup, verifyDownloadedBackup, waiveSessionBackup, type SessionPublic } from '../lib/session';
import { authorizeKeyExport, deleteEncryptedVault, loadedKeysRecoverable, readEncryptedVault, saveEncryptedVault, unlockEncryptedVault, VaultChangedError, vaultMetaAddress, VaultSavedForPreviousKeysError } from '../lib/keyVault';
import { useApp } from '../state';
import { multipartIfNeeded } from '../lib/qrMultipart';
import { SellerPairing, pairingChainIds } from './SellerPairing';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import type { Translator } from '../i18n/translator';

interface KeyOperation {
  readonly kind: 'export' | 'import' | 'unlock' | 'verify';
  readonly controller: AbortController;
}

/**
 * Stands in for `children` (the meta-address, an invoice form, a whole view) until the loaded keys have a verified
 * recoverable copy or the seller has explicitly typed the waiver (L1-01, GP-PAGES-02-R2). A keystore download alone
 * is unverified and must not unlock invoicing: every payment it invites may be lost if the tab closes without a backup.
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
  if (backup === undefined || backup.verified || backup.waived || (backup.signerOnly && props.paymentsOnly === true)) return props.children;
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

export function SellerKeys(props: { readonly archive?: ReactNode } = {}): ReactNode {
  const app = useApp();
  const i18n = useI18nOptional();
  const translator = useRef(i18n?.t ?? SOURCE_TRANSLATOR.t);
  translator.current = i18n?.t ?? SOURCE_TRANSLATOR.t;
  const t: Translator['t'] = (key, values) => translator.current(key, values);
  const backup = useSyncExternalStore(subscribeSessionBackup, getSessionBackup);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: DisplayMessage } | undefined>(undefined);
  const [spend, setSpend] = useState('');
  const [view, setViewKey] = useState('');
  const [signing, setSigning] = useState('');
  // New passphrases start as a generated suggestion (L1-06), shown in clear only while untouched.
  const [suggestedPass, setSuggestedPass] = useState(generatePassphrase);
  const [pass, setPass] = useState(suggestedPass);
  const [pass2, setPass2] = useState('');
  const [importPass, setImportPass] = useState('');
  const [importText, setImportText] = useState<string | undefined>();
  // The controller owns its busy indication. Retiring it releases only cancellable work.
  const operation = useRef<KeyOperation | null>(null);
  const [pendingOperation, setPendingOperation] = useState<KeyOperation | null>(null);
  const busy = pendingOperation?.kind === 'export' || pendingOperation?.kind === 'import';
  const verifyBusy = pendingOperation?.kind === 'verify';
  const unlockBusy = pendingOperation?.kind === 'unlock';
  const mounted = useRef(false);
  const generation = useRef(0);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | undefined>(undefined);
  const [backupQr, setBackupQr] = useState<string | undefined>(undefined);
  const [backupSmaller, setBackupSmaller] = useState(false);
  // "Verify backup" (GP-PAGES-02) retains its own file and passphrase across other form operations.
  const verifyFileInput = useRef<HTMLInputElement | null>(null);
  const [verifyFile, setVerifyFile] = useState<File | undefined>(undefined);
  const [verifyPass, setVerifyPass] = useState('');
  // The panel's own outcome and stage: a stale or superseded verification never writes either.
  const [verifyResult, setVerifyResult] = useState<{ kind: 'error'; text: DisplayMessage } | { kind: 'ok' }>();
  const [verifyStage, setVerifyStage] = useState<'reading' | 'checking'>();
  const [vaultState, setVaultState] = useState<'checking' | 'empty' | 'saved' | 'unavailable'>('checking');
  // Public meta-address named by the saved vault, if it is a readable keystore.
  const [vaultMeta, setVaultMeta] = useState<string | undefined>(undefined);
  const [suggestedVaultPass, setSuggestedVaultPass] = useState(generatePassphrase);
  const [vaultSavePass, setVaultSavePass] = useState(suggestedVaultPass);
  const [vaultSavePass2, setVaultSavePass2] = useState('');
  const [vaultUnlockPass, setVaultUnlockPass] = useState('');
  // Durable save/delete writes outlive cancellation, form edits and session changes.
  const vaultWrite = useRef<symbol | null>(null);
  const [vaultWriteBusy, setVaultWriteBusy] = useState(false);
  const vaultBusy = unlockBusy || vaultWriteBusy;
  // Step-up passphrases of the vault the loaded keys are tied to (L1-02), and the delete confirmation's passphrase.
  const [exportStepUp, setExportStepUp] = useState('');
  const [saveStepUp, setSaveStepUp] = useState('');
  const [deletePass, setDeletePass] = useState('');
  const [deletePhrase, setDeletePhrase] = useState('');
  // Unlocking would replace keys that have no backup; set once the user asked to unlock anyway (L1-01).
  const [confirmReplace, setConfirmReplace] = useState(false);
  // Wiping would lose keys that have no backup; set once the user asked to wipe them anyway (C-R4).
  const [confirmWipe, setConfirmWipe] = useState(false);
  // The exact ciphertext shown when deletion was requested; Confirm deletes only this record. Never plaintext keys.
  const [deleteExpected, setDeleteExpected] = useState<string | undefined>(undefined);
  const confirmVaultDelete = deleteExpected !== undefined;

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
  const resetVerify = (): void => {
    if (verifyFileInput.current !== null) verifyFileInput.current.value = '';
    setVerifyFile(undefined); setVerifyPass(''); setVerifyResult(undefined); setVerifyStage(undefined);
  };
  const cancelVerify = (): void => {
    if (operation.current?.kind === 'verify') stopOperation();
    resetVerify();
  };
  const clearOperation = (): void => {
    const previous = operation.current;
    operation.current = null;
    if (mounted.current) setPendingOperation(null);
    previous?.controller.abort();
  };
  const stopOperation = (): void => {
    generation.current += 1;
    clearOperation();
  };
  const clearImport = (): void => {
    stopOperation();
    setImportPass(''); setFile(undefined); setImportText(undefined); setVaultUnlockPass('');
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
    setExportStepUp(''); setSaveStepUp(''); setDeletePass(''); setVerifyPass('');
  };
  useEffect(() => subscribeAppLock(() => {
    stopOperation();
    resetVerify();
    // A pending local-vault save/delete has its own lifetime; do not label it cancelled or enable a duplicate.
    setImportText(undefined); setFile(undefined); resetFilePicker();
    setConfirmReplace(false); setConfirmWipe(false); setDeleteExpected(undefined); setBackupQr(undefined);
    forgetTyped();
  }), []);
  useEffect(() => {
    // This effect may precede our own unlock/import return; its finally block then no longer owns the controller.
    // Keep generation unchanged so that ownCompletion can still acknowledge that installation.
    clearOperation();
    setBackupQr(undefined);
    forgetTyped(); setImportText(undefined); setFile(undefined);
    resetFilePicker(); resetVerify();
    setConfirmReplace(false); setConfirmWipe(false); setDeleteExpected(undefined);
  }, [app.session]);
  const startOperation = (kind: KeyOperation['kind']): AbortController => {
    stopOperation();
    const controller = new AbortController();
    const next = { kind, controller };
    operation.current = next;
    setPendingOperation(next);
    return controller;
  };
  const currentOperation = (controller: AbortController): boolean => mounted.current && operation.current?.controller === controller && !controller.signal.aborted;
  const finishOperation = (controller: AbortController): void => {
    if (operation.current?.controller !== controller) return;
    operation.current = null;
    if (mounted.current) setPendingOperation(null);
  };
  const startVaultWrite = (): symbol | undefined => {
    if (vaultWrite.current !== null || operation.current?.kind === 'unlock') return undefined;
    const owner = Symbol('vault-write');
    vaultWrite.current = owner;
    setVaultWriteBusy(true);
    return owner;
  };
  const currentVaultWrite = (owner: symbol): boolean => mounted.current && vaultWrite.current === owner;
  const finishVaultWrite = (owner: symbol): void => {
    if (vaultWrite.current !== owner) return;
    vaultWrite.current = null;
    if (mounted.current) setVaultWriteBusy(false);
  };
  // Installing our own keys triggers the session effect above. Only explicit cancellation, edits or another operation
  // revoke this completion; a new session, even with identical public keys, has a different summary object.
  const ownCompletion = (id: number, installed: SessionPublic): boolean =>
    mounted.current && generation.current === id && getSessionPublic() === installed;

  const fail = (e: unknown): void => {
    setMessage({ kind: 'error', text: captureUserMessage(e) });
  };
  const done = (text: DisplayMessage): void => {
    setMessage({ kind: 'ok', text });
    app.announce(displayMessage(text, t));
  };

  const onImportRaw = (e: FormEvent): void => {
    e.preventDefault();
    try {
      importSession({ spendingKeyHex: spend, viewingKeyHex: view, ...(signing.trim() === '' ? {} : { signingKeyHex: signing }) });
      setSpend('');
      setViewKey('');
      setSigning('');
      done({ key: 'sellerKeys.loaded' });
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
    const problem = passphraseProblemMessage(pass);
    if (problem !== undefined) {
      setMessage({ kind: 'error', text: problem });
      return;
    }
    if (pass !== pass2) {
      setMessage({ kind: 'error', text: { key: 'sellerKeys.passphrasesDiffer' } });
      return;
    }
    const controller = startOperation('export');
    const unchanged = captureSessionVersionGuard();
    const stepUp = exportStepUp;
    setMessage({ kind: 'ok', text: { key: 'sellerKeys.encrypting' } });
    void (async () => {
      // Keys tied to a vault leave this tab only with that vault's passphrase (L1-02).
      await authorizeKeyExport(stepUp);
      if (!currentOperation(controller)) return undefined;
      unchanged();
      return exportKeystore(pass);
    })().then(
      (text) => {
        if (!currentOperation(controller) || text === undefined) return;
        try { unchanged(); } catch (error) { fail(error); return; }
        try {
          downloadText('ghostpay-keystore.json', text, 'application/json');
        } catch (error) {
          // A blocked download produced no file: report it, re-enable the form and leave the backup unrecorded.
          setExportStepUp('');
          fail(error);
          return;
        }
        // A download remains unverified until the file is reopened; by itself it cannot permit an idle-lock wipe.
        markKeystoreDownloaded(unchanged);
        setBackupQr(text);
        setPass('');
        setPass2('');
        setExportStepUp('');
        done({ key: 'sellerKeys.keystoreDownloaded' });
      },
      (err: unknown) => {
        if (!currentOperation(controller)) return;
        setExportStepUp('');
        // A vault saved meanwhile (another tab) may be why the step-up was needed: show its field.
        refreshVault();
        fail(err);
      },
    ).finally(() => { finishOperation(controller); });
  };

  const onImportKeystore = (e: FormEvent): void => {
    e.preventDefault();
    if (file === undefined && importText === undefined) { setMessage({ kind: 'error', text: { key: 'sellerKeys.chooseFile' } }); return; }
    if (file !== undefined && file.size > MAX_KEYSTORE_BYTES) { setMessage({ kind: 'error', text: { key: 'sellerKeys.notKeystore' } }); return; }
    const controller = startOperation('import');
    const id = generation.current;
    const unchanged = captureSessionVersionGuard();
    const selected = file; const pasted = importText; const passphrase = importPass;
    setMessage({ kind: 'ok', text: { key: 'sellerKeys.decrypting' } });
    void (async () => {
      try {
        const text = selected === undefined ? pasted! : await selected.text();
        if (!currentOperation(controller)) return;
        unchanged();
        const installed = await importKeystore(text, passphrase, controller.signal);
        if (!ownCompletion(id, installed)) return;
        setImportPass(''); setFile(undefined); setImportText(undefined);
        done({ key: 'sellerKeys.keystoreDecrypted' });
      } catch (error) {
        if (!currentOperation(controller)) return;
        setImportPass(''); fail(error);
      } finally {
        finishOperation(controller);
      }
    })();
  };

  const onVerifyBackup = (e: FormEvent): void => {
    e.preventDefault();
    // A refused attempt clears the passphrase like a failed check does.
    if (verifyFile === undefined) { setVerifyPass(''); setVerifyResult({ kind: 'error', text: { key: 'sellerKeys.verify.chooseFile' } }); return; }
    if (verifyFile.size > MAX_KEYSTORE_BYTES) { setVerifyPass(''); setVerifyResult({ kind: 'error', text: { key: 'error.keystore.fileTooLarge' } }); return; }
    const controller = startOperation('verify');
    const selected = verifyFile; const passphrase = verifyPass;
    // The result is for the keys loaded now: a seller change during reading or checking retires it.
    const unchanged = captureSessionVersionGuard();
    setVerifyResult(undefined); setVerifyStage('reading');
    void (async () => {
      try {
        const text = await selected.text();
        if (!currentOperation(controller)) return;
        unchanged();
        setVerifyStage('checking');
        await verifyDownloadedBackup(text, passphrase, controller.signal);
        if (!currentOperation(controller)) return;
        unchanged();
        resetVerify();
        setVerifyResult({ kind: 'ok' });
      } catch (error) {
        if (!currentOperation(controller)) return;
        setVerifyPass(''); setVerifyStage(undefined); setVerifyResult({ kind: 'error', text: captureUserMessage(error) });
      } finally {
        finishOperation(controller);
      }
    })();
  };

  const onSaveVault = (e: FormEvent): void => {
    e.preventDefault();
    const problem = passphraseProblemMessage(vaultSavePass);
    if (problem !== undefined) { setMessage({ kind: 'error', text: problem }); return; }
    if (vaultSavePass !== vaultSavePass2) { setMessage({ kind: 'error', text: { key: 'sellerKeys.passphrasesDiffer' } }); return; }
    const owner = startVaultWrite();
    if (owner === undefined) return;
    const unchanged = captureSessionVersionGuard();
    // Only the initiating save may report; it may claim success only for the keys that were loaded when it started.
    const stepUp = saveStepUp;
    void saveEncryptedVault(vaultSavePass, {}, undefined, stepUp).then(
      () => {
        if (!currentVaultWrite(owner)) return;
        setVaultSavePass('');
        setVaultSavePass2('');
        setSaveStepUp('');
        setVaultState('saved');
        try { unchanged(); } catch { fail(new VaultSavedForPreviousKeysError()); return; }
        refreshVault();
        done({ key: 'sellerKeys.vaultSaved' });
      },
      (err: unknown) => {
        if (!currentVaultWrite(owner)) return;
        setSaveStepUp('');
        if (err instanceof VaultSavedForPreviousKeysError) { setVaultSavePass(''); setVaultSavePass2(''); setVaultState('saved'); }
        refreshVault();
        fail(err);
      },
    ).finally(() => { finishVaultWrite(owner); });
  };

  const onUnlockVault = (e: FormEvent): void => {
    e.preventDefault();
    if (vaultWrite.current !== null) return;
    // Own the recoverability read as well as decryption, so cancellation cannot revive a delayed unlock request.
    const controller = startOperation('unlock');
    // Unlocking replaces the loaded keys; keys with no backup would be lost with every payment to them (L1-01). As for a
    // wipe, a vault copy is looked up in storage first, because another tab may have deleted or replaced it since this page
    // last read it (C-R12). A key change during that read drops the request.
    if (getSessionBackup() === undefined || sessionHasExternalCopy()) { unlockVault(false, controller); return; }
    const unchanged = captureSessionVersionGuard();
    void loadedKeysRecoverable().then(
      (recoverable) => {
        if (!currentOperation(controller)) return;
        try { unchanged(); } catch { finishOperation(controller); return; }
        if (recoverable) unlockVault(false, controller);
        else { finishOperation(controller); setConfirmReplace(true); }
      },
      (error: unknown) => {
        if (!currentOperation(controller)) return;
        finishOperation(controller);
        fail(error);
      },
    );
  };

  const unlockVault = (replaceUnsavedKeys: boolean, pending?: AbortController): void => {
    if (vaultWrite.current !== null) return;
    const controller = pending ?? startOperation('unlock');
    const id = generation.current;
    setConfirmReplace(false);
    void unlockEncryptedVault(vaultUnlockPass, undefined, controller.signal, { replaceUnsavedKeys }).then(
      (installed) => {
        if (!ownCompletion(id, installed)) return;
        setVaultUnlockPass('');
        setBackupQr(undefined);
        done({ key: 'sellerKeys.vaultUnlocked' });
      },
      (err: unknown) => {
        if (!currentOperation(controller)) return;
        setVaultUnlockPass('');
        fail(err);
      },
    ).finally(() => { finishOperation(controller); });
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
    setMessage({ kind: 'ok', text: { key: 'sellerKeys.wiped' } });
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
        setDeletePhrase('');
        setDeleteExpected(saved);
      },
      (err: unknown) => { if (mounted.current) fail(err); },
    );
  };

  const onDeleteVault = (): void => {
    const expected = deleteExpected;
    if (expected === undefined || !deleteAuthorized) return;
    const owner = startVaultWrite();
    if (owner === undefined) return;
    const passphrase = deletePass;
    void deleteEncryptedVault(expected, undefined, passphrase).then(
      () => {
        if (!currentVaultWrite(owner)) return;
        setDeleteExpected(undefined);
        setDeletePass('');
        setVaultState('empty');
        refreshVault();
        done({ key: 'sellerKeys.vaultDeleted' });
      },
      (err: unknown) => {
        if (!currentVaultWrite(owner)) return;
        setDeletePass('');
        if (err instanceof VaultChangedError) { setDeleteExpected(undefined); refreshVault(); }
        fail(err);
      },
    ).finally(() => { finishVaultWrite(owner); });
  };

  const s = app.session;
  // Keys tied to a vault, or with a saved vault for the same meta-address, need its passphrase to be exported (L1-02).
  const stepUpNeeded = backup?.vaultStepUp === true || (s !== undefined && vaultState === 'saved' && vaultMeta === s.metaAddress);
  const deleteMeta = deleteExpected === undefined ? undefined : vaultMetaAddress(deleteExpected);
  const deletesLoadedKeys = s !== undefined && deleteMeta === s.metaAddress;
  const deleteAction = t('sellerKeys.confirmDelete');
  const deleteAuthorized = deletesLoadedKeys ? deletePass !== '' : deletePhrase === deleteAction;
  // Optional smaller codes for low-resolution cameras: same encrypted text, split into GhostPay multi-part QR.
  let backupParts: readonly string[] | undefined;
  try { backupParts = backupQr !== undefined && backupSmaller ? multipartIfNeeded(backupQr, { force: true }) : undefined; } catch { backupParts = undefined; }

  return (
    <section aria-labelledby="keys-h">
      <h2 id="keys-h">{t('sellerKeys.title')}</h2>
      <Notice kind="info" title={t('sellerKeys.memory.title')}>
        {t('sellerKeys.memory.body')}
      </Notice>
      {message !== undefined && <Notice kind={message.kind}>{displayMessage(message.text, t)}</Notice>}
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
            <Field label={t('sellerKeys.vaultPassphrase')} hint={t('sellerKeys.vaultNoBrowserSave')}>{(id, d) => <input id={id} aria-describedby={d} type="password" autoComplete="off" name="ghostpay-vault-unlock" value={vaultUnlockPass} onChange={(e) => { stopOperation(); setConfirmReplace(false); setVaultUnlockPass(e.target.value); }} />}</Field>
            <button type="submit" className="btn" disabled={vaultBusy || vaultUnlockPass === ''}>{t('sellerKeys.unlockVault')}</button>
            {unlockBusy && <button type="button" className="btn" onClick={cancelImport}>{t('sellerKeys.cancelUnlock')}</button>}
          </form>
          {confirmReplace && (
            <Notice kind="warn" title={backup?.signerOnly === true ? t('sellerKeys.unlockReplacesSignerOnly.title') : backup?.backedUp === true ? t('sellerKeys.unlockReplacesUnverified.title') : t('sellerKeys.unlockReplaces.title')}>
              <p>{backup?.signerOnly === true ? t('sellerKeys.unlockReplacesSignerOnly.body') : backup?.backedUp === true ? t('sellerKeys.unlockReplacesUnverified.body') : t('sellerKeys.unlockReplaces.body')}</p>
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
              {deletesLoadedKeys ? (
                <Field label={t('sellerKeys.deletePassphrase')}>{(id) => <input id={id} type="password" autoComplete="off" name="ghostpay-vault-delete" value={deletePass} onChange={(e) => { setDeletePass(e.target.value); }} />}</Field>
              ) : (
                <Field label={t('sellerKeys.deleteSoleCopy', { phrase: deleteAction })}>{(id) => <input id={id} autoComplete="off" spellCheck={false} value={deletePhrase} onChange={(e) => { setDeletePhrase(e.target.value); }} />}</Field>
              )}
              <button type="button" className="btn btn-danger" disabled={vaultBusy || !deleteAuthorized} onClick={onDeleteVault}>{deleteAction}</button>{' '}
              <button type="button" className="btn" onClick={() => { setDeleteExpected(undefined); setDeletePass(''); }}>{t('sellerKeys.cancel')}</button>
            </div>
          )}
        </section>
      )}

      {s === undefined ? (
        <>
          <p>
            <button type="button" className="btn btn-primary" onClick={() => { try { generateSession(); done({ key: 'sellerKeys.generated' }); } catch (err) { fail(err); } }}>
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
              <Field label={t('sellerKeys.keystoreFile')} help={{ label: t('help.about', { control: t('sellerKeys.keystoreFile') }), text: t('help.keystoreFile') }}>{(id, describedBy) => <>
                <input id={id} aria-describedby={[describedBy, file === undefined ? undefined : `${id}-file`].filter(Boolean).join(' ') || undefined} ref={fileInput} type="file" accept="application/json,.json" onChange={(e) => {
                  const chosen = e.currentTarget.files?.[0]; e.currentTarget.value = '';
                  if (chosen === undefined) return;
                  clearImport(); setFile(chosen);
                }} />
                {file !== undefined && <p className="hint" id={`${id}-file`}>{t('upload.selectedFile')}: <bdi><SafeText value={file.name} /></bdi></p>}
              </>}</Field>
              <Field label={t('sellerKeys.passphrase')}>{(id) => <input id={id} type="password" autoComplete="off" value={importPass} onChange={(e) => { stopOperation(); setImportPass(e.target.value); }} />}</Field>
              <button type="submit" className="btn" disabled={busy}>{t('sellerKeys.decryptLoad')}</button>
              {busy && <button type="button" className="btn" onClick={cancelImport}>{t('sellerKeys.cancelKeystore')}</button>}
            </form>
            <CameraImporter multipart label={t('sellerKeys.importKeystoreQr')} scopeKey={app.session} onInputChange={cancelImport} onText={(text, signal) => {
              validateKeystoreEnvelope(text);
              if (signal.aborted) return false;
              cancelImport(); setImportText(text); setMessage({ kind: 'ok', text: { key: 'sellerKeys.keystoreReceived' } }); return true;
            }} />
          </details>
          <SellerPairing session={undefined} chainIds={[]} />
        </>
      ) : (
        <>
          <h3>{t('sellerKeys.metaHeading')}</h3>
          <BackupGate paymentsOnly>
            <p>{t('sellerKeys.metaShare')}</p>
            <p><Mono>{s.metaAddress}</Mono></p>
            <QrFrame kind="shareable" text={s.metaAddress} caption={t('sellerKeys.metaCaption')} />
            <p><CopyButton text={s.metaAddress} label={t('sellerKeys.copyMeta')} /></p>
            <SellerPairing session={s} chainIds={pairingChainIds(app.settings.rpcUrls)} />
          </BackupGate>
          <h3>{t('sellerKeys.signingKeyHeading')}</h3>
          <p><Mono>{s.signerPublicKey}</Mono></p>
          <p className="hint">{t('sellerKeys.payersSee')}</p>

          <h3 id="keystore-backup-h" tabIndex={-1}>{t('sellerKeys.backupHeading')}</h3>
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
              <label className="checkbox"><input type="checkbox" checked={backupSmaller} onChange={(e) => { setBackupSmaller(e.target.checked); }} /> {t('sellerKeys.backupSmaller')}</label>
              <p className="hint">{t('sellerKeys.backupSmallerHint')}</p>
              <QrFrame kind="secret" text={backupQr} caption={t('sellerKeys.backupCaption')} {...(backupParts === undefined ? {} : { chunks: backupParts })} />
              <button type="button" className="btn" onClick={() => { setBackupQr(undefined); }}>{t('sellerKeys.forgetQr')}</button>
            </>
          )}

          <section className="panel" aria-labelledby="verify-backup-h">
            <h4 id="verify-backup-h">{t('sellerKeys.verify.heading')}</h4>
            <p>{t('sellerKeys.verify.explain')}</p>
            <div role="status">
              {verifyBusy && verifyStage !== undefined && <p>{verifyStage === 'reading' ? t('sellerKeys.verify.reading') : t('sellerKeys.verify.checking')}</p>}
              {verifyResult?.kind === 'ok' && <Notice kind="ok">{t('sellerKeys.verify.ok')} {t('sellerKeys.verify.limit')}</Notice>}
            </div>
            {verifyResult?.kind === 'error' && <Notice kind="error">{displayMessage(verifyResult.text, t)}</Notice>}
            <form onSubmit={onVerifyBackup} className="stack" autoComplete="off">
              <Field label={t('sellerKeys.verify.file')}>{(id) => <>
                <input id={id} aria-describedby={verifyFile === undefined ? undefined : `${id}-file`} ref={verifyFileInput} type="file" accept="application/json,.json" onChange={(e) => {
                  const chosen = e.currentTarget.files?.[0]; e.currentTarget.value = '';
                  if (chosen === undefined) return;
                  cancelVerify(); setVerifyFile(chosen);
                }} />
                {verifyFile !== undefined && <p className="hint" id={`${id}-file`}>{t('upload.selectedFile')}: <bdi><SafeText value={verifyFile.name} /></bdi></p>}
              </>}</Field>
              <Field label={t('sellerKeys.verify.passphrase')}>{(id) => <input id={id} type="password" autoComplete="off" name="ghostpay-verify-backup" value={verifyPass} onChange={(e) => { if (operation.current?.kind === 'verify') stopOperation(); setVerifyStage(undefined); setVerifyResult(undefined); setVerifyPass(e.target.value); }} />}</Field>
              <button type="submit" className="btn" disabled={verifyBusy || verifyFile === undefined || verifyPass === ''}>{t('sellerKeys.verify.submit')}</button>
              {verifyBusy && <button type="button" className="btn" onClick={cancelVerify}>{t('sellerKeys.verify.cancel')}</button>}
            </form>
          </section>

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
            <Notice kind="warn" title={backup?.signerOnly === true ? t('sellerKeys.wipeSignerOnly.title') : backup?.backedUp === true ? t('sellerKeys.wipeUnverified.title') : t('sellerKeys.wipeUnsaved.title')}>
              <p>{backup?.signerOnly === true ? t('sellerKeys.wipeSignerOnly.body') : backup?.backedUp === true ? t('sellerKeys.wipeUnverified.body') : t('sellerKeys.wipeUnsaved.body')}</p>
              <button type="button" className="btn btn-danger" onClick={wipe}>{t('sellerKeys.wipeUnsaved.confirm')}</button>{' '}
              <button type="button" className="btn" onClick={() => { setConfirmWipe(false); }}>{t('sellerKeys.cancel')}</button>
            </Notice>
          )}
          {/* Local scan state is keyed by a hash of the public keys and outlives the wipe (audit I-1). */}
          <p className="hint">{t('sellerKeys.wipeHint')}</p>
        </>
      )}

      {props.archive}

      <h3>{t('sellerKeys.registryHeading')}</h3>
      <p className="hint">{t('sellerKeys.registryHint')}</p>
      <p><button type="button" className="btn" onClick={() => { app.setView('registry'); }}>{t('sellerKeys.openRegistry')}</button></p>
    </section>
  );
}
