import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { UserFacingError, userMessage } from '../lib/errors';
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
  const openedHistory = useRef(new Set<ReconciliationVault>());
  const closeHistory = (): void => {
    for (const history of openedHistory.current) history.lock();
    openedHistory.current.clear();
  };
  const invalidate = (): void => {
    operation.current?.abort(); operation.current = null;
    closeHistory(); setBusy(false); setStaged(undefined);
  };

  const start = (retainHistory = false): AbortController => {
    operation.current?.abort();
    if (!retainHistory) { closeHistory(); setStaged(undefined); }
    const c = new AbortController(); operation.current = c; return c;
  };
  const current = (c: AbortController): boolean => mounted.current && operation.current === c && !c.signal.aborted;
  const reset = (): void => {
    invalidate();
    setPass(''); setPass2(''); setImportPass(''); setFile(undefined); setStaged(undefined); setConfirm('none');
  };
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; operation.current?.abort(); closeHistory(); };
  }, []);
  // A different or cleared seller session invalidates every pending action and staged preview.
  useEffect(() => { reset(); }, [app.session]);

  const ensureUnlocked = async (): Promise<void> => {
    if (!vault.unlocked) await vault.unlock(revealViewingKey());
  };
  const fail = (e: unknown): void => { setMessage({ kind: 'error', text: userMessage(e) }); };
  const done = (text: string): void => { setMessage({ kind: 'ok', text }); app.announce(text); };

  const historyVaults = async (c: AbortController): Promise<{ vaults: { chainId: number; vault: ReconciliationVault }[]; skipped: number }> => {
    const s = getSessionPublic();
    if (s === undefined) return { vaults: [], skipped: 0 };
    const keyId = checkpointKeyId(s.spendingPublicKey, s.viewingPublicKey);
    const vaults: { chainId: number; vault: ReconciliationVault }[] = [];
    let skipped = 0;
    for (const chain of chains) {
      if (!current(c)) throw new UserFacingError('Archive operation cancelled.');
      let history: ReconciliationVault;
      try { history = await createCurrentReconciliationVault(chain.chainId, keyId); }
      catch { skipped++; continue; }
      if (!current(c)) { history.lock(); throw new UserFacingError('Archive operation cancelled.'); }
      openedHistory.current.add(history);
      vaults.push({ chainId: chain.chainId, vault: history });
    }
    return { vaults, skipped };
  };
  const closeVaults = (vaults: readonly { vault: ReconciliationVault }[]): void => {
    for (const history of vaults) { history.vault.lock(); openedHistory.current.delete(history.vault); }
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
        if (!current(c)) return;
        unchanged();
        const history: Record<string, string> = {};
        let skipped = 0;
        if (withHistory) {
          const opened = await historyVaults(c);
          vaults = opened.vaults; skipped = opened.skipped;
          for (const h of vaults) {
            try { history[String(h.chainId)] = await h.vault.exportEncrypted(); } catch { skipped++; }
          }
        }
        // Tags and history must come from the keys this export started with (L1-04).
        if (!current(c)) return;
        unchanged();
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
        closeVaults(vaults);
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
      let vaults: { chainId: number; vault: ReconciliationVault }[] = [];
      let retained = false;
      try {
        const bytes = new Uint8Array(await selected.arrayBuffer());
        if (!current(c)) return;
        unchanged();
        await ensureUnlocked();
        const archive = await previewArchiveImport(vault, bytes, passphrase, mode, c.signal);
        if (!current(c)) return;
        unchanged();
        const opened = await historyVaults(c);
        vaults = opened.vaults;
        for (const chain of archive.historyChains) {
          if (!vaults.some((h) => String(h.chainId) === chain))
            throw new UserFacingError(`Scan history for chain ${chain} cannot be opened here. No import was started.`);
        }
        const history: Staged['history'][number][] = [];
        for (const h of vaults) {
          if (!current(c)) return;
          unchanged();
          const text = archive.contents.history[String(h.chainId)];
          if (text === undefined) { closeVaults([h]); continue; }
          history.push({ ...h, preview: await h.vault.previewImport(text) });
        }
        if (!current(c)) return;
        unchanged();
        setImportPass(''); setBusy(false); setStaged({ archive, history });
        retained = true;
        setMessage({ kind: 'ok', text: 'Archive decrypted. Review the summary; nothing has been changed yet.' });
      } catch (error) {
        if (!current(c)) return;
        setImportPass(''); setBusy(false); fail(error);
      } finally {
        if (!retained) closeVaults(vaults);
      }
    })();
  };

  const onApply = (): void => {
    if (staged === undefined) return;
    const c = start(true); const unchanged = captureSessionVersionGuard();
    const s = staged;
    type Outcome = 'not started' | 'commit outcome unknown' | 'committed';
    let tags: Outcome = 'not started';
    const history: Outcome[] = s.history.map(() => 'not started');
    const guard = (): void => {
      if (!current(c)) throw new UserFacingError('Import interrupted; subsequent stores were not started.');
      unchanged();
    };
    setBusy(true);
    void (async () => {
      try {
        guard();
        tags = 'commit outcome unknown';
        await vault.applyImport(s.archive.tags);
        tags = 'committed';
        for (const [index, h] of s.history.entries()) {
          guard();
          history[index] = 'commit outcome unknown';
          await h.vault.activateImport(h.preview);
          history[index] = 'committed';
        }
        guard();
        setStaged(undefined); setFile(undefined); setBusy(false);
        done(`Imported: ${String(s.archive.tags.added)} added, ${String(s.archive.tags.updated)} updated, ${String(s.archive.tags.removed)} removed. Tags committed.${s.history.length > 0 ? ` Scan history committed for ${String(s.history.length)} chain(s); restored history remains historical evidence, not a fresh scan.` : ''}`);
      } catch (error) {
        // A completed transaction cannot be cancelled, and a rejected acknowledgement
        // does not prove unchanged storage. Never overwrite concurrent edits with a rollback.
        if (!mounted.current || (operation.current !== c && operation.current !== null)) return;
        setStaged(undefined); setBusy(false);
        const outcomes = s.history.map((h, index) => `Scan history ${String(h.chainId)}: ${history[index] ?? 'not started'}.`).join(' ');
        const reason = error instanceof UserFacingError ? error.message : 'The operation stopped.';
        setMessage({ kind: 'error', text: `Import incomplete. Tags: ${tags}. ${outcomes} ${reason} Stores commit separately; inspect local data and make a new preview before retrying.` });
      } finally {
        closeVaults(s.history);
      }
    })();
  };

  const onRotate = (): void => {
    const c = start(); const unchanged = captureSessionVersionGuard();
    setBusy(true); setConfirm('none');
    void (async () => {
      try {
        await ensureUnlocked();
        if (!current(c)) return;
        unchanged();
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
    const c = start(); const unchanged = captureSessionVersionGuard();
    setConfirm('none'); setBusy(true);
    void (async () => {
      try {
        unchanged();
        await vault.wipe();
        if (!current(c)) return;
        unchanged(); setBusy(false); done('All local tags deleted.');
      } catch (error) {
        if (!current(c)) return;
        setBusy(false); fail(error);
      }
    })();
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
            <Field label="Archive passphrase">{(id) => <input id={id} type="password" autoComplete="off" value={importPass} onChange={(e) => { invalidate(); setImportPass(e.target.value); }} />}</Field>
            <label><input type="radio" name="tag-import-mode" checked={mode === 'merge'} onChange={() => { invalidate(); setMode('merge'); }} /> Merge (newest wins)</label>
            <label><input type="radio" name="tag-import-mode" checked={mode === 'replace'} onChange={() => { invalidate(); setMode('replace'); }} /> Replace all local tags</label>
            <button type="submit" className="btn" disabled={busy}>Decrypt and preview</button>
          </form>
          {staged !== undefined && (
            <div role="status">
              <p>
                {String(staged.archive.tags.total)} tag(s) in the archive: {String(staged.archive.tags.added)} new, {String(staged.archive.tags.updated)} updated,
                {' '}{String(staged.archive.tags.keptLocal)} kept because your copy is newer, {String(staged.archive.tags.removed)} local tag(s) removed.
                {staged.history.length > 0 && ` Scan history for ${String(staged.history.length)} chain(s) will be merged in separate transactions. A failure can leave a partial import. Restored observations remain history; they are not fresh payment proof.`}
              </p>
              {staged.history.map((h) => <p key={h.chainId}>Chain {String(h.chainId)}: {String(h.preview.recordCount)} history record(s), {String(h.preview.invalidatedCount)} invalidated.{h.preview.readOnly && ' This import makes the history vault read-only because its safety limit has been reached.'}</p>)}
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
              <button type="button" className="btn btn-danger" disabled={busy} onClick={() => { setConfirm('wipe2'); }}>I understand, continue</button>{' '}
              <button type="button" className="btn" onClick={() => { setConfirm('none'); }}>Cancel</button>
            </div>
          ) : (
            <div>
              <p>Last chance: this cannot be undone.</p>
              <button type="button" className="btn btn-danger" disabled={busy} onClick={onWipe}>Permanently delete all tags</button>{' '}
              <button type="button" className="btn" onClick={() => { setConfirm('none'); }}>Cancel</button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
