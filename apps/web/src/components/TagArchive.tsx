import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { userMessage } from '../lib/errors';
import { passphraseProblem } from '../lib/keystore';
import { createCurrentReconciliationVault, type ReconciliationImportPreview, type ReconciliationVault } from '../lib/reconciliationVault';
import { checkpointKeyId } from '../lib/scanClient';
import { useServices } from '../lib/services';
import { captureSessionVersionGuard, getSessionPublic, revealViewingKey } from '../lib/session';
import { MAX_ARCHIVE_BYTES, exportArchive, previewArchiveImport, type ArchiveImportPreview } from '../lib/tagArchive';
import { useApp } from '../state';
import { Field, Notice } from './Common';

interface Staged {
  readonly archive: ArchiveImportPreview;
  readonly history: readonly { readonly chainId: number; readonly vault: ReconciliationVault; readonly preview: ReconciliationImportPreview }[];
}

function downloadBytes(filename: string, bytes: Uint8Array<ArrayBuffer>): void {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => { URL.revokeObjectURL(url); }, 1000);
}

/** Encrypted tag backup, import with preview, key rotation and wipe. Everything is local; the passphrase is never stored. */
export function TagArchive(): ReactNode {
  const app = useApp();
  const { vault, chains } = useServices();
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [withHistory, setWithHistory] = useState(true);
  const [importPass, setImportPass] = useState('');
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [file, setFile] = useState<File | undefined>(undefined);
  const [staged, setStaged] = useState<Staged | undefined>(undefined);
  const [confirm, setConfirm] = useState<'none' | 'rotate' | 'wipe1' | 'wipe2'>('none');
  const operation = useRef<AbortController | null>(null);
  const mounted = useRef(false);

  const start = (): AbortController => {
    operation.current?.abort();
    const c = new AbortController(); operation.current = c; return c;
  };
  const current = (c: AbortController): boolean => mounted.current && operation.current === c && !c.signal.aborted;
  const reset = (): void => {
    operation.current?.abort(); operation.current = null;
    setBusy(false); setPass(''); setPass2(''); setImportPass(''); setFile(undefined); setStaged(undefined); setConfirm('none');
  };
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; operation.current?.abort(); };
  }, []);
  // A different or cleared seller session invalidates every pending action and staged preview.
  useEffect(() => { reset(); }, [app.session]);

  const ensureUnlocked = async (): Promise<void> => {
    if (!vault.unlocked) await vault.unlock(revealViewingKey());
  };
  const fail = (e: unknown): void => { setMessage({ kind: 'error', text: userMessage(e) }); };
  const done = (text: string): void => { setMessage({ kind: 'ok', text }); app.announce(text); };

  const historyVaults = async (): Promise<{ chainId: number; vault: ReconciliationVault }[]> => {
    const s = getSessionPublic();
    if (s === undefined) return [];
    const keyId = checkpointKeyId(s.spendingPublicKey, s.viewingPublicKey);
    const out: { chainId: number; vault: ReconciliationVault }[] = [];
    for (const c of chains) {
      try { out.push({ chainId: c.chainId, vault: await createCurrentReconciliationVault(c.chainId, keyId) }); } catch { /* chain has no usable history vault */ }
    }
    return out;
  };

  const onExport = (e: FormEvent): void => {
    e.preventDefault();
    const problem = passphraseProblem(pass);
    if (problem !== undefined) { setMessage({ kind: 'error', text: problem }); return; }
    if (pass !== pass2) { setMessage({ kind: 'error', text: 'The two passphrases differ.' }); return; }
    const c = start(); const unchanged = captureSessionVersionGuard();
    setBusy(true); setMessage({ kind: 'ok', text: 'Encrypting (this takes a moment on purpose)…' });
    void (async () => {
      let vaults: { chainId: number; vault: ReconciliationVault }[] = [];
      try {
        await ensureUnlocked();
        const history: Record<string, string> = {};
        let skipped = 0;
        if (withHistory) {
          vaults = await historyVaults();
          for (const h of vaults) {
            try { history[String(h.chainId)] = await h.vault.exportEncrypted(); } catch { skipped++; }
          }
        }
        const out = await exportArchive(vault, revealViewingKey(), pass, { history });
        if (!current(c)) return;
        unchanged();
        downloadBytes(out.filename, out.bytes);
        setPass(''); setPass2(''); setBusy(false);
        done(`Archive downloaded: ${String(out.recordCount)} tag(s). SHA-256 ${out.sha256}. Keep the file and the passphrase: neither can be recovered.${skipped > 0 ? ` Scan history for ${String(skipped)} chain(s) could not be read and is NOT in this archive.` : ''}`);
      } catch (error) {
        if (!current(c)) return;
        setBusy(false); fail(error);
      } finally {
        for (const h of vaults) h.vault.lock();
      }
    })();
  };

  const onPreview = (e: FormEvent): void => {
    e.preventDefault();
    if (file === undefined) { setMessage({ kind: 'error', text: 'Choose an archive file first.' }); return; }
    if (file.size > MAX_ARCHIVE_BYTES) { setMessage({ kind: 'error', text: 'This is not a valid GhostPay tag archive.' }); return; }
    const c = start(); const unchanged = captureSessionVersionGuard();
    const selected = file; const passphrase = importPass;
    setBusy(true); setStaged(undefined); setMessage({ kind: 'ok', text: 'Decrypting…' });
    void (async () => {
      try {
        const bytes = new Uint8Array(await selected.arrayBuffer());
        if (!current(c)) return;
        unchanged();
        await ensureUnlocked();
        const archive = await previewArchiveImport(vault, bytes, passphrase, mode, c.signal);
        const history: Staged['history'][number][] = [];
        for (const h of await historyVaults()) {
          const text = archive.contents.history[String(h.chainId)];
          if (text === undefined) { h.vault.lock(); continue; }
          history.push({ ...h, preview: await h.vault.previewImport(text) });
        }
        if (!current(c)) { for (const h of history) h.vault.lock(); return; }
        unchanged();
        setImportPass(''); setBusy(false); setStaged({ archive, history });
        setMessage({ kind: 'ok', text: 'Archive decrypted. Review the summary; nothing has been changed yet.' });
      } catch (error) {
        if (!current(c)) return;
        setImportPass(''); setBusy(false); fail(error);
      }
    })();
  };

  const onApply = (): void => {
    if (staged === undefined) return;
    const c = start(); const unchanged = captureSessionVersionGuard();
    const s = staged;
    setBusy(true);
    void (async () => {
      try {
        unchanged();
        await vault.applyImport(s.archive.tags);
        for (const h of s.history) await h.vault.activateImport(h.preview);
        if (!mounted.current) return;
        setStaged(undefined); setFile(undefined); setBusy(false);
        done(`Imported: ${String(s.archive.tags.added)} added, ${String(s.archive.tags.updated)} updated, ${String(s.archive.tags.removed)} removed.`);
      } catch (error) {
        if (!current(c)) return;
        setStaged(undefined); setBusy(false); fail(error);
      } finally {
        for (const h of s.history) h.vault.lock();
      }
    })();
  };

  const onRotate = (): void => {
    const c = start(); const unchanged = captureSessionVersionGuard();
    setBusy(true); setConfirm('none');
    void (async () => {
      try {
        await ensureUnlocked();
        const v = await vault.rotateKeys(revealViewingKey());
        if (!current(c)) return;
        unchanged();
        setStaged(undefined); setBusy(false);
        done(`Tag keys rotated (key version ${String(v)}). Archives made earlier still open with their own passphrase. This does not replace your viewing key.`);
      } catch (error) {
        if (!current(c)) return;
        setBusy(false); fail(error);
      }
    })();
  };

  const onWipe = (): void => {
    setConfirm('none'); setStaged(undefined);
    void vault.wipe().then(() => { done('All local tags deleted.'); }, fail);
  };

  const s = app.session;
  return (
    <section className="panel" aria-labelledby="tagarc-h">
      <h3 id="tagarc-h">Client tags: encrypted backup and key rotation</h3>
      {message !== undefined && <Notice kind={message.kind}>{message.text}</Notice>}
      {s === undefined ? <p>Load seller keys to back up or restore client tags.</p> : (
        <>
          <form onSubmit={onExport} className="stack" autoComplete="off">
            <Field label="Archive passphrase (at least 14 characters)">{(id) => <input id={id} type="password" autoComplete="new-password" value={pass} onChange={(e) => { setPass(e.target.value); }} />}</Field>
            <Field label="Repeat archive passphrase">{(id) => <input id={id} type="password" autoComplete="new-password" value={pass2} onChange={(e) => { setPass2(e.target.value); }} />}</Field>
            <label><input type="checkbox" checked={withHistory} onChange={(e) => { setWithHistory(e.target.checked); }} /> Include scan history</label>
            <button type="submit" className="btn" disabled={busy}>Download encrypted tag archive</button>
          </form>
          <p className="hint">Format: scrypt (N=2^17, r=8, p=1) and AES-256-GCM, .gpa file with a fixed name that never contains labels. The archive holds your tags, not your keys. Anyone with the file can try passphrases offline, so use a strong one. The page you are using can read unlocked tags: a script injected into it could too, so keep this page free of untrusted extensions.</p>

          <form onSubmit={onPreview} className="stack" autoComplete="off">
            <Field label="Archive file">{(id) => <input id={id} type="file" accept=".gpa,application/octet-stream" onChange={(e) => { reset(); setFile(e.target.files?.[0]); }} />}</Field>
            <Field label="Archive passphrase">{(id) => <input id={id} type="password" autoComplete="off" value={importPass} onChange={(e) => { if (busy) reset(); setImportPass(e.target.value); }} />}</Field>
            <label><input type="radio" name="tag-import-mode" checked={mode === 'merge'} onChange={() => { setMode('merge'); setStaged(undefined); }} /> Merge (newest wins)</label>
            <label><input type="radio" name="tag-import-mode" checked={mode === 'replace'} onChange={() => { setMode('replace'); setStaged(undefined); }} /> Replace all local tags</label>
            <button type="submit" className="btn" disabled={busy}>Decrypt and preview</button>
          </form>
          {staged !== undefined && (
            <div role="status">
              <p>
                {String(staged.archive.tags.total)} tag(s) in the archive: {String(staged.archive.tags.added)} new, {String(staged.archive.tags.updated)} updated,
                {' '}{String(staged.archive.tags.keptLocal)} kept because your copy is newer, {String(staged.archive.tags.removed)} local tag(s) removed.
                {staged.history.length > 0 && ` Scan history for ${String(staged.history.length)} chain(s) will be merged.`}
              </p>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={onApply}>Apply import</button>{' '}
              <button type="button" className="btn" onClick={reset}>Discard</button>
            </div>
          )}

          <h4>Rotate tag keys</h4>
          {confirm !== 'rotate' ? (
            <button type="button" className="btn" disabled={busy} onClick={() => { setConfirm('rotate'); }}>Rotate tag keys</button>
          ) : (
            <div>
              <p>This re-encrypts every tag under a new salt in one all-or-nothing step. It does not protect data exposed earlier and does not replace your viewing key: if the viewing key may be compromised, generate new seller keys instead.</p>
              <button type="button" className="btn btn-danger" disabled={busy} onClick={onRotate}>Confirm rotation</button>{' '}
              <button type="button" className="btn" onClick={() => { setConfirm('none'); }}>Cancel</button>
            </div>
          )}

          <h4>Delete all tags</h4>
          {confirm !== 'wipe1' && confirm !== 'wipe2' ? (
            <button type="button" className="btn btn-danger" disabled={busy} onClick={() => { setConfirm('wipe1'); }}>Delete all local tags</button>
          ) : confirm === 'wipe1' ? (
            <div>
              <p>This deletes every tag in this browser. Download an archive first if you may need them.</p>
              <button type="button" className="btn btn-danger" onClick={() => { setConfirm('wipe2'); }}>I understand, continue</button>{' '}
              <button type="button" className="btn" onClick={() => { setConfirm('none'); }}>Cancel</button>
            </div>
          ) : (
            <div>
              <p>Last chance: this cannot be undone.</p>
              <button type="button" className="btn btn-danger" onClick={onWipe}>Permanently delete all tags</button>{' '}
              <button type="button" className="btn" onClick={() => { setConfirm('none'); }}>Cancel</button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
