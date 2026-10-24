import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { CopyButton, Field, Mono, Notice, downloadText } from '../components/Common';
import { TagArchive } from '../components/TagArchive';
import { CameraImporter } from '../components/CameraImporter';
import { QrFrame } from '../components/QrFrame';
import { userMessage } from '../lib/errors';
import { MAX_KEYSTORE_BYTES, passphraseProblem, validateKeystoreEnvelope } from '../lib/keystore';
import { captureSessionVersionGuard, clearSession, exportKeystore, generateSession, importKeystore, importSession } from '../lib/session';
import { deleteEncryptedVault, readEncryptedVault, saveEncryptedVault, unlockEncryptedVault } from '../lib/keyVault';
import { useApp } from '../state';

export function SellerKeys(): ReactNode {
  const app = useApp();
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
  const [file, setFile] = useState<File | undefined>(undefined);
  const [backupQr, setBackupQr] = useState<string | undefined>(undefined);
  const [vaultState, setVaultState] = useState<'checking' | 'empty' | 'saved' | 'unavailable'>('checking');
  const [vaultSavePass, setVaultSavePass] = useState('');
  const [vaultSavePass2, setVaultSavePass2] = useState('');
  const [vaultUnlockPass, setVaultUnlockPass] = useState('');
  const [vaultBusy, setVaultBusy] = useState(false);
  const [confirmVaultDelete, setConfirmVaultDelete] = useState(false);

  useEffect(() => {
    let live = true;
    void readEncryptedVault().then(
      (saved) => { if (live) setVaultState(saved === undefined ? 'empty' : 'saved'); },
      () => { if (live) setVaultState('unavailable'); },
    );
    return () => { live = false; };
  }, []);

  const cancelImport = (): void => {
    operation.current?.abort(); operation.current = null;
    setBusy(false); setVaultBusy(false); setImportPass(''); setFile(undefined); setImportText(undefined); setVaultUnlockPass('');
  };
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; operation.current?.abort(); operation.current = null; };
  }, []);
  useEffect(() => {
    operation.current?.abort(); operation.current = null;
    setBackupQr(undefined); setBusy(false); setVaultBusy(false);
    setPass(''); setPass2(''); setImportPass(''); setVaultUnlockPass(''); setImportText(undefined); setFile(undefined);
  }, [app.session]);
  const startOperation = (): AbortController => {
    operation.current?.abort();
    const controller = new AbortController(); operation.current = controller; return controller;
  };
  const currentOperation = (controller: AbortController): boolean => mounted.current && operation.current === controller && !controller.signal.aborted;

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
      done('Keys loaded into memory.');
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
      setMessage({ kind: 'error', text: 'The two passphrases differ.' });
      return;
    }
    const controller = startOperation();
    const unchanged = captureSessionVersionGuard();
    setBusy(true);
    setMessage({ kind: 'ok', text: 'Encrypting (this takes a moment on purpose)…' });
    exportKeystore(pass).then(
      (text) => {
        if (!currentOperation(controller)) return;
        try { unchanged(); } catch (error) { setBusy(false); fail(error); return; }
        downloadText('ghostpay-keystore.json', text, 'application/json');
        setBackupQr(text);
        setPass('');
        setPass2('');
        setBusy(false);
        done('Encrypted keystore downloaded. Keep the file and remember the passphrase: neither can be recovered.');
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
    if (file === undefined && importText === undefined) { setMessage({ kind: 'error', text: 'Choose a keystore file first.' }); return; }
    if (file !== undefined && file.size > MAX_KEYSTORE_BYTES) { setMessage({ kind: 'error', text: 'This is not a GhostPay keystore file.' }); return; }
    const controller = startOperation();
    const unchanged = captureSessionVersionGuard();
    const selected = file; const pasted = importText; const passphrase = importPass;
    setBusy(true); setMessage({ kind: 'ok', text: 'Decrypting…' });
    void (async () => {
      try {
        const text = selected === undefined ? pasted! : await selected.text();
        if (!currentOperation(controller)) return;
        unchanged();
        await importKeystore(text, passphrase, controller.signal);
        if (!currentOperation(controller)) return;
        setImportPass(''); setFile(undefined); setImportText(undefined); setBusy(false);
        done('Keystore decrypted; keys are in memory.');
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
    if (vaultSavePass !== vaultSavePass2) { setMessage({ kind: 'error', text: 'The two passphrases differ.' }); return; }
    setVaultBusy(true);
    void saveEncryptedVault(vaultSavePass).then(
      () => {
        setVaultSavePass('');
        setVaultSavePass2('');
        setVaultState('saved');
        setVaultBusy(false);
        done('Encrypted seller vault saved in this browser. The passphrase was cleared.');
      },
      (err: unknown) => {
        setVaultBusy(false);
        fail(err);
      },
    );
  };

  const onUnlockVault = (e: FormEvent): void => {
    e.preventDefault();
    const controller = startOperation();
    setVaultBusy(true);
    void unlockEncryptedVault(vaultUnlockPass, undefined, controller.signal).then(
      () => {
        if (!currentOperation(controller)) return;
        setVaultUnlockPass('');
        setBackupQr(undefined);
        setVaultBusy(false);
        done('Encrypted vault unlocked. Seller keys are back in memory.');
      },
      (err: unknown) => {
        if (!currentOperation(controller)) return;
        setVaultUnlockPass('');
        setVaultBusy(false);
        fail(err);
      },
    );
  };

  const onDeleteVault = (): void => {
    setVaultBusy(true);
    void deleteEncryptedVault().then(
      () => {
        setVaultState('empty');
        setConfirmVaultDelete(false);
        setVaultBusy(false);
        done('Encrypted vault deleted from this browser.');
      },
      (err: unknown) => {
        setVaultBusy(false);
        fail(err);
      },
    );
  };

  const s = app.session;
  return (
    <section aria-labelledby="keys-h">
      <h2 id="keys-h">Seller keys</h2>
      <Notice kind="info" title="Keys stay in memory by default">
        Keys are generated and used only inside this page. They are never written to browser storage unless you explicitly save the optional encrypted vault below. Reloading or closing the tab forgets keys that were not saved.
      </Notice>
      {message !== undefined && <Notice kind={message.kind}>{message.text}</Notice>}
      {vaultState === 'checking' && <p role="status">Checking for an encrypted seller vault…</p>}
      {vaultState === 'unavailable' && (
        <Notice kind="warn" title="Encrypted browser storage is unavailable">
          This browser cannot read the optional vault. In-memory key use and encrypted file backups remain available, but do not try to save a local vault here.
        </Notice>
      )}
      {vaultState === 'saved' && (
        <section className="panel" aria-labelledby="vault-unlock-h">
          <h3 id="vault-unlock-h">Encrypted seller vault saved in this browser</h3>
          <p>Unlocking replaces the keys currently in memory. The vault stores only the encrypted keystore text; your passphrase is never saved.</p>
          <form onSubmit={onUnlockVault} className="stack" autoComplete="off">
            <Field label="Vault passphrase">{(id) => <input id={id} type="password" autoComplete="current-password" value={vaultUnlockPass} onChange={(e) => { if (vaultBusy) { operation.current?.abort(); setVaultBusy(false); } setVaultUnlockPass(e.target.value); }} />}</Field>
            <button type="submit" className="btn" disabled={vaultBusy || vaultUnlockPass === ''}>Unlock saved vault</button>
            {vaultBusy && operation.current !== null && <button type="button" className="btn" onClick={cancelImport}>Cancel vault unlock</button>}
          </form>
          {!confirmVaultDelete ? (
            <button type="button" className="btn btn-danger" disabled={vaultBusy} onClick={() => { setConfirmVaultDelete(true); }}>Delete encrypted vault</button>
          ) : (
            <div>
              <p>This permanently deletes the saved ciphertext in this browser. Keep a separate backup first if needed.</p>
              <button type="button" className="btn btn-danger" disabled={vaultBusy} onClick={onDeleteVault}>Confirm delete encrypted vault</button>{' '}
              <button type="button" className="btn" onClick={() => { setConfirmVaultDelete(false); }}>Cancel</button>
            </div>
          )}
        </section>
      )}

      {s === undefined ? (
        <>
          <p>
            <button type="button" className="btn btn-primary" onClick={() => { try { generateSession(); done('New keys generated in memory.'); } catch (err) { fail(err); } }}>
              Generate new keys
            </button>
          </p>
          <details onToggle={(event) => { if (!event.currentTarget.open) { setSpend(''); setViewKey(''); setSigning(''); } }}>
            <summary>Import existing keys (hex)</summary>
            <form onSubmit={onImportRaw} className="stack" autoComplete="off">
              <Field label="Spending private key (64 hex characters)">{(id) => <input id={id} type="password" autoComplete="off" spellCheck={false} value={spend} onChange={(e) => { setSpend(e.target.value); }} />}</Field>
              <Field label="Viewing private key (64 hex characters)">{(id) => <input id={id} type="password" autoComplete="off" spellCheck={false} value={view} onChange={(e) => { setViewKey(e.target.value); }} />}</Field>
              <Field label="Invoice-signing private key (optional)" hint="Leave empty to generate a separate signing key. It must not be your spending or viewing key.">
                {(id, d) => <input id={id} aria-describedby={d} type="password" autoComplete="off" spellCheck={false} value={signing} onChange={(e) => { setSigning(e.target.value); }} />}
              </Field>
              <button type="submit" className="btn">Load keys</button>
            </form>
          </details>
          <details onToggle={(event) => { if (!event.currentTarget.open) cancelImport(); }}>
            <summary>Import an encrypted keystore</summary>
            <form onSubmit={onImportKeystore} className="stack">
              <Field label="Keystore file">{(id) => <input id={id} type="file" accept="application/json,.json" onChange={(e) => { cancelImport(); setFile(e.target.files?.[0]); }} />}</Field>
              <Field label="Passphrase">{(id) => <input id={id} type="password" autoComplete="off" value={importPass} onChange={(e) => { if (busy) { operation.current?.abort(); setBusy(false); } setImportPass(e.target.value); }} />}</Field>
              <button type="submit" className="btn" disabled={busy}>Decrypt and load</button>
              {busy && <button type="button" className="btn" onClick={cancelImport}>Cancel keystore import</button>}
            </form>
            <CameraImporter label="Import encrypted keystore QR" scopeKey={app.session} onInputChange={cancelImport} onText={(text, signal) => {
              validateKeystoreEnvelope(text);
              if (signal.aborted) return false;
              cancelImport(); setImportText(text); setMessage({ kind: 'ok', text: 'Encrypted keystore received. Enter its passphrase and choose Decrypt and load.' }); return true;
            }} />
          </details>
        </>
      ) : (
        <>
          <h3>Your meta-address (public)</h3>
          <p>Share this to receive payments. It reveals no private key.</p>
          <p><Mono>{s.metaAddress}</Mono></p>
          <QrFrame kind="shareable" text={s.metaAddress} caption="Seller stealth meta-address" />
          <p><CopyButton text={s.metaAddress} label="Copy meta-address" /></p>
          <h3>Invoice-signing public key</h3>
          <p><Mono>{s.signerPublicKey}</Mono></p>
          <p className="hint">Payers see &ldquo;signature matches key …&rdquo;. They can pin this key; an unpinned key identifies nobody.</p>

          <h3>Back up (encrypted)</h3>
          <form onSubmit={onExport} className="stack" autoComplete="off">
            <Field label="Passphrase (at least 14 characters)">{(id) => <input id={id} type="password" autoComplete="new-password" value={pass} onChange={(e) => { setPass(e.target.value); }} />}</Field>
            <Field label="Repeat passphrase">{(id) => <input id={id} type="password" autoComplete="new-password" value={pass2} onChange={(e) => { setPass2(e.target.value); }} />}</Field>
            <button type="submit" className="btn" disabled={busy}>Download encrypted keystore</button>
          </form>
          <p className="hint">Format: scrypt (N=2^17, r=8, p=1) and AES-256-GCM. The passphrase is not stored anywhere.</p>
          {backupQr !== undefined && (
            <>
              <QrFrame kind="secret" text={backupQr} caption="Encrypted seller keystore backup" />
              <button type="button" className="btn" onClick={() => { setBackupQr(undefined); }}>Forget encrypted QR from this page</button>
            </>
          )}

          <section className="panel" aria-labelledby="vault-save-h">
            <h3 id="vault-save-h">Optional encrypted browser vault</h3>
            <p>
              This keeps an encrypted keystore in this browser&rsquo;s IndexedDB so you can unlock after reload. Anyone with access to this browser profile can copy the ciphertext and attempt offline guesses; choose a strong passphrase. Browser storage can be cleared or lost, so keep a separate backup. GhostPay never saves the passphrase or plaintext key material here.
            </p>
            {vaultState === 'empty' ? (
              <form onSubmit={onSaveVault} className="stack" autoComplete="off">
                <Field label="New vault passphrase (14+ characters)">{(id) => <input id={id} type="password" autoComplete="new-password" value={vaultSavePass} onChange={(e) => { setVaultSavePass(e.target.value); }} />}</Field>
                <Field label="Repeat vault passphrase">{(id) => <input id={id} type="password" autoComplete="new-password" value={vaultSavePass2} onChange={(e) => { setVaultSavePass2(e.target.value); }} />}</Field>
                <button type="submit" className="btn" disabled={vaultBusy}>Save encrypted vault in this browser</button>
              </form>
            ) : vaultState === 'saved' ? (
              <p>A vault already exists. It is never overwritten automatically; unlock or explicitly delete it before saving a different key set.</p>
            ) : vaultState === 'unavailable' ? null : <p role="status">Checking vault availability…</p>}
          </section>

          <h3>Forget keys</h3>
          <button type="button" className="btn btn-danger" onClick={() => { clearSession(); setBackupQr(undefined); app.announce('Keys wiped from memory.'); setMessage({ kind: 'ok', text: 'Keys wiped from memory.' }); }}>
            Wipe keys from memory
          </button>
        </>
      )}

      <TagArchive />

      <h3>Public registry</h3>
      <p className="hint">Publishing your meta-address to the ERC-6538 registry would publicly associate it with your wallet address. Publishing is optional and has its own page.</p>
      <p><button type="button" className="btn" onClick={() => { app.setView('registry'); }}>Open public registry page</button></p>
    </section>
  );
}
