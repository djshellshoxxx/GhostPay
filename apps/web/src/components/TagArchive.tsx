import { subscribeAppLock } from '../lib/appLock';
import { findChain } from '@ghostpay/chain-adapters';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import type { Translator } from '../i18n/translator';
import { UserFacingError, captureUserMessage, displayMessage, type DisplayMessage, type MessageDescriptor } from '../lib/errors';
import { GENERATED_PASSPHRASE_BITS, GENERATED_PASSPHRASE_WORDS, generatePassphrase, passphraseProblemMessage } from '../lib/keystore';
import { createCurrentReconciliationVault, type ReconciliationImportPreview, type ReconciliationVault } from '../lib/reconciliationVault';
import { checkpointKeyId } from '../lib/scanClient';
import { useServices } from '../lib/services';
import { captureSessionVersionGuard, getSessionPublic, revealViewingKey } from '../lib/session';
import { MAX_ARCHIVE_BYTES, exportArchive, previewArchiveImport, type ArchiveImportPreview } from '../lib/tagArchive';
import { useApp } from '../state';
import { Field, Notice } from './Common';
import { ContextHelp } from './ContextHelp';

interface Staged {
  readonly archive: ArchiveImportPreview;
  readonly history: readonly { readonly chainId: number; readonly vault: ReconciliationVault; readonly preview: ReconciliationImportPreview }[];
}

type ImportOutcome = 'notStarted' | 'unknown' | 'committed';
export type ArchiveNote = MessageDescriptor & { readonly chainIds?: readonly number[] };
type ArchiveMessage = DisplayMessage | { readonly parts: readonly (DisplayMessage | ArchiveNote)[] } | {
  readonly partialImport: {
    readonly tags: ImportOutcome;
    readonly history: readonly { readonly chainId: number; readonly outcome: ImportOutcome }[];
    readonly reason: DisplayMessage;
  };
};

/** Keep outcome facts separate from copy so a language change never repeats an import or freezes a warning. */
function archiveMessage(message: ArchiveMessage, translator: Translator): string {
  const t = translator.t;
  if (typeof message !== 'string' && 'parts' in message) return message.parts.map((part) =>
    typeof part !== 'string' && 'chainIds' in part ? displayArchiveNote(part, translator) : displayMessage(part, t),
  ).join(' ');
  if (typeof message !== 'string' && 'partialImport' in message) {
    const { tags, history, reason } = message.partialImport;
    const outcome = (value: ImportOutcome): string => t(value === 'notStarted' ? 'tagArchive.outcome.notStarted' : value === 'unknown' ? 'tagArchive.outcome.unknown' : 'tagArchive.outcome.committed');
    return t('tagArchive.msg.incomplete', {
      tags: outcome(tags),
      outcomes: history.map((item) => t('tagArchive.msg.historyOutcome', { chain: String(item.chainId), outcome: outcome(item.outcome) })).join(' '),
      reason: displayMessage(reason, t),
    });
  }
  return displayMessage(message, t);
}

/** Render identifiers and locale-aware conjunctions without retaining already-translated gap warnings. */
export function displayArchiveNote(note: ArchiveNote, translator: Translator): string {
  return note.chainIds === undefined ? displayMessage(note, translator.t) : translator.t(note.key, {
    chains: translator.list(note.chainIds.map((id) => chainLabel(id, translator.t))),
  });
}

function downloadBytes(filename: string, bytes: Uint8Array<ArrayBuffer>): void {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => { URL.revokeObjectURL(url); }, 1000);
}

/**
 * Where IdbReconciliationVaultStore (lib/reconciliationVault.ts) keeps scan history: one record per `${sellerKeyId}:${chainId}`.
 * TagArchive.history.test.ts writes through that store and fails if these drift apart.
 */
const HISTORY_DB = 'ghostpay-reconciliation-encrypted';
const HISTORY_STORE = 'vaults';

/**
 * Chain ids with scan history (encrypted reconciliation vaults: observations, invoice registrations and receipts) stored in
 * this browser for `sellerKeyId`, whether or not this build supports the chain (I-2). Reads record keys only, never
 * ciphertext, and never creates the database; without IndexedDB nothing can be stored, so the list is empty.
 */
export function storedHistoryChains(sellerKeyId: string, factory: IDBFactory | undefined = globalThis.indexedDB): Promise<readonly number[]> {
  return new Promise((resolve, reject) => {
    if (factory === undefined) { resolve([]); return; }
    const failed = (): void => { reject(new UserFacingError({ key: 'tagArchive.msg.listFailed' })); };
    let creating = false;
    const request = factory.open(HISTORY_DB);
    // Opening a database that does not exist would create it: abort that instead, since it holds no history.
    request.onupgradeneeded = () => { creating = true; request.transaction?.abort(); };
    request.onerror = () => { if (creating) resolve([]); else failed(); };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); };
      if (!db.objectStoreNames.contains(HISTORY_STORE)) { db.close(); resolve([]); return; }
      const tx = db.transaction(HISTORY_STORE, 'readonly');
      const keys = tx.objectStore(HISTORY_STORE).getAllKeys();
      tx.oncomplete = () => {
        db.close();
        const prefix = `${sellerKeyId}:`;
        const ids = keys.result.flatMap((key) => {
          if (typeof key !== 'string' || !key.startsWith(prefix)) return [];
          const id = Number(key.slice(prefix.length));
          return Number.isSafeInteger(id) && id > 0 && String(id) === key.slice(prefix.length) ? [id] : [];
        });
        resolve(ids.sort((a, b) => a - b));
      };
      tx.onerror = tx.onabort = () => { db.close(); failed(); };
    };
  });
}

/** "Ethereum (chain 1)", or "chain 12345" for a chain this build does not know. */
function chainLabel(chainId: number, t: Translator['t']): string {
  const name = findChain(chainId)?.name;
  return name === undefined ? t('tagArchive.chain.unknown', { id: String(chainId) }) : t('tagArchive.chain.named', { name, id: String(chainId) });
}

/** What an export attempt did: reported only after the file was handed to the browser, or after the attempt failed. */
export type ArchiveExportResult =
  | {
    readonly ok: true;
    readonly recordCount: number;
    readonly sha256: string;
    /** The seller asked for scan history to be included. */
    readonly history: boolean;
    /** Scan history is missing from the archive for at least one chain. */
    readonly gaps: boolean;
    /** Plain-language notes on what is NOT in the archive (empty when nothing is missing). */
    readonly notes: readonly ArchiveNote[];
  }
  | { readonly ok: false; readonly message: DisplayMessage };

/**
 * Encrypted tag backup, import with preview, key rotation and wipe. Everything is local; the passphrase is never stored.
 * @param props.onExport Optional observer of export attempts (the combined backup panel); it changes no behavior here.
 */
export function TagArchive(props: { readonly onExport?: (result: ArchiveExportResult) => void; readonly onTagsWiped?: () => void } = {}): ReactNode {
  const { onExport: reportExport, onTagsWiped } = props;
  const i18n = useI18nOptional();
  // Reached through a ref: an export or import that settles after a language change reports in the language then in effect.
  const tr = i18n ?? SOURCE_TRANSLATOR;
  const trRef = useRef(tr);
  trRef.current = tr;
  const t = (key: Parameters<Translator['t']>[0], values?: Parameters<Translator['t']>[1]): string => trRef.current.t(key, values);
  const app = useApp();
  const { vault, chains } = useServices();
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: ArchiveMessage } | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  // The archive passphrase starts as a generated suggestion (L1-06), shown in clear only while untouched.
  const [suggested, setSuggested] = useState(generatePassphrase);
  const [pass, setPass] = useState(suggested);
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
  const suggest = (): void => { const next = generatePassphrase(); setSuggested(next); setPass(next); setPass2(''); };
  // A different or cleared seller session invalidates every pending action and staged preview.
  useEffect(() => { reset(); suggest(); }, [app.session]);
  // Archive passphrases typed here go at every idle lock too, also while unsaved keys stay loaded: react-dom mirrors a
  // controlled input's value into its value attribute (G2-05, C-R11).
  useEffect(() => subscribeAppLock(() => { reset(); suggest(); }), []);

  const ensureUnlocked = async (): Promise<void> => {
    if (!vault.unlocked) await vault.unlock(revealViewingKey());
  };
  const fail = (e: unknown): void => { setMessage({ kind: 'error', text: captureUserMessage(e) }); };
  const done = (text: ArchiveMessage): void => { setMessage({ kind: 'ok', text }); app.announce(archiveMessage(text, trRef.current)); };

  const historyVaults = async (c: AbortController): Promise<{ vaults: { chainId: number; vault: ReconciliationVault }[]; skipped: number }> => {
    const s = getSessionPublic();
    if (s === undefined) return { vaults: [], skipped: 0 };
    const keyId = checkpointKeyId(s.spendingPublicKey, s.viewingPublicKey);
    const vaults: { chainId: number; vault: ReconciliationVault }[] = [];
    let skipped = 0;
    for (const chain of chains) {
      if (!current(c)) throw new UserFacingError({ key: 'tagArchive.msg.cancelled' });
      let history: ReconciliationVault;
      try { history = await createCurrentReconciliationVault(chain.chainId, keyId); }
      catch { skipped++; continue; }
      if (!current(c)) { history.lock(); throw new UserFacingError({ key: 'tagArchive.msg.cancelled' }); }
      openedHistory.current.add(history);
      vaults.push({ chainId: chain.chainId, vault: history });
    }
    return { vaults, skipped };
  };
  const closeVaults = (vaults: readonly { vault: ReconciliationVault }[]): void => {
    for (const history of vaults) { history.vault.lock(); openedHistory.current.delete(history.vault); }
  };
  /** Chains with scan history stored here for the loaded keys that this build cannot open; undefined when it cannot be listed. */
  const unsupportedHistory = async (): Promise<readonly number[] | undefined> => {
    const s = getSessionPublic();
    if (s === undefined) return [];
    try {
      const stored = await storedHistoryChains(checkpointKeyId(s.spendingPublicKey, s.viewingPublicKey));
      return stored.filter((id) => !chains.some((chain) => chain.chainId === id));
    } catch {
      return undefined;
    }
  };

  const onExport = (e: FormEvent): void => {
    e.preventDefault();
    const problem = passphraseProblemMessage(pass);
    if (problem !== undefined) { setMessage({ kind: 'error', text: problem }); return; }
    if (pass !== pass2) { setMessage({ kind: 'error', text: { key: 'sellerKeys.passphrasesDiffer' } }); return; }
    const c = start(); const unchanged = captureSessionVersionGuard();
    setBusy(true); setMessage({ kind: 'ok', text: { key: 'tagArchive.msg.encrypting' } });
    void (async () => {
      let vaults: { chainId: number; vault: ReconciliationVault }[] = [];
      try {
        await ensureUnlocked();
        if (!current(c)) return;
        unchanged();
        const history: Record<string, string> = {};
        let skipped = 0;
        // History of chains this build does not support is never opened here; name it rather than leave it out silently (I-2).
        let unsupported: readonly number[] | undefined = [];
        if (withHistory) {
          const opened = await historyVaults(c);
          vaults = opened.vaults; skipped = opened.skipped;
          for (const h of vaults) {
            try { history[String(h.chainId)] = await h.vault.exportEncrypted(); } catch { skipped++; }
          }
          unsupported = await unsupportedHistory();
        }
        // Tags and history must come from the keys this export started with (L1-04).
        if (!current(c)) return;
        unchanged();
        const out = await exportArchive(vault, revealViewingKey(), pass, { history });
        if (!current(c)) return;
        unchanged();
        downloadBytes(out.filename, out.bytes);
        setPass(''); setPass2(''); setBusy(false);
        const missing: ArchiveNote[] = [];
        if (skipped > 0) missing.push({ key: 'tagArchive.missing.skipped', values: { count: String(skipped) } });
        if (unsupported === undefined) missing.push({ key: 'tagArchive.missing.unlisted' });
        if (unsupported !== undefined && unsupported.length > 0) missing.push({
          key: unsupported.length === 1 ? 'tagArchive.missing.unsupportedOne' : 'tagArchive.missing.unsupportedMany',
          chainIds: unsupported,
        });
        reportExport?.({ ok: true, recordCount: out.recordCount, sha256: out.sha256, history: withHistory, gaps: missing.length > 0, notes: missing });
        done({ parts: [{ key: 'tagArchive.msg.downloaded', values: { count: String(out.recordCount), sha: out.sha256 } }, ...missing] });
      } catch (error) {
        if (!current(c)) return;
        setBusy(false); fail(error);
        reportExport?.({ ok: false, message: captureUserMessage(error) });
      } finally {
        closeVaults(vaults);
      }
    })();
  };

  const onPreview = (e: FormEvent): void => {
    e.preventDefault();
    if (file === undefined) { setMessage({ kind: 'error', text: { key: 'tagArchive.msg.chooseFile' } }); return; }
    if (file.size > MAX_ARCHIVE_BYTES) { setMessage({ kind: 'error', text: { key: 'tagArchive.msg.invalidArchive' } }); return; }
    const c = start(); const unchanged = captureSessionVersionGuard();
    const selected = file; const passphrase = importPass;
    setBusy(true); setStaged(undefined); setMessage({ kind: 'ok', text: { key: 'sellerKeys.decrypting' } });
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
            throw new UserFacingError({ key: 'tagArchive.msg.historyOpen', values: { chain } });
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
        setMessage({ kind: 'ok', text: { key: 'tagArchive.msg.decrypted' } });
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
    let tags: ImportOutcome = 'notStarted';
    const history: ImportOutcome[] = s.history.map(() => 'notStarted');
    const guard = (): void => {
      if (!current(c)) throw new UserFacingError({ key: 'tagArchive.msg.interrupted' });
      unchanged();
    };
    setBusy(true);
    void (async () => {
      try {
        guard();
        tags = 'unknown';
        await vault.applyImport(s.archive.tags);
        tags = 'committed';
        for (const [index, h] of s.history.entries()) {
          guard();
          history[index] = 'unknown';
          await h.vault.activateImport(h.preview);
          history[index] = 'committed';
        }
        guard();
        setStaged(undefined); setFile(undefined); setBusy(false);
        const parts: DisplayMessage[] = [{ key: 'tagArchive.msg.imported', values: { added: String(s.archive.tags.added), updated: String(s.archive.tags.updated), removed: String(s.archive.tags.removed) } }];
        if (s.history.length > 0) parts.push({ key: 'tagArchive.msg.importedHistory', values: { count: String(s.history.length) } });
        done({ parts });
      } catch (error) {
        // A completed transaction cannot be cancelled, and a rejected acknowledgement
        // does not prove unchanged storage. Never overwrite concurrent edits with a rollback.
        if (!mounted.current || (operation.current !== c && operation.current !== null)) return;
        setStaged(undefined); setBusy(false);
        const reason = error instanceof UserFacingError ? captureUserMessage(error) : { key: 'tagArchive.msg.stopped' } as const;
        setMessage({ kind: 'error', text: { partialImport: {
          tags, history: s.history.map((item, index) => ({ chainId: item.chainId, outcome: history[index] ?? 'notStarted' })), reason,
        } } });
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
        done({ key: 'tagArchive.msg.rotated', values: { version: String(v) } });
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
        unchanged(); setBusy(false); onTagsWiped?.(); done({ key: 'tagArchive.msg.wiped' });
      } catch (error) {
        if (!current(c)) return;
        setBusy(false); fail(error);
      }
    })();
  };

  const s = app.session;
  return (
    <section className="panel" aria-labelledby="tagarc-h">
      <h3 id="tagarc-h">{t('tagArchive.heading')}</h3>
      {message !== undefined && <Notice kind={message.kind}>{archiveMessage(message.text, trRef.current)}</Notice>}
      {s === undefined ? <p>{t('tagArchive.loadKeys')}</p> : (
        <>
          <form onSubmit={onExport} className="stack" autoComplete="off">
            <Field label={t('tagArchive.passphrase.label')} {...(pass !== '' && pass === suggested ? { hint: t('tagArchive.passphrase.suggested', { words: String(GENERATED_PASSPHRASE_WORDS), bits: String(GENERATED_PASSPHRASE_BITS) }) } : {})}>
              {(id, d) => <input id={id} aria-describedby={d} type={pass !== '' && pass === suggested ? 'text' : 'password'} autoComplete="new-password" spellCheck={false} value={pass} onChange={(e) => { setPass(e.target.value); }} />}
            </Field>
            <p><button type="button" className="btn" onClick={suggest}>{t('tagArchive.passphrase.another')}</button></p>
            <Field label={t('tagArchive.passphrase.repeat')}>{(id) => <input id={id} type="password" autoComplete="new-password" value={pass2} onChange={(e) => { setPass2(e.target.value); }} />}</Field>
            <label><input type="checkbox" checked={withHistory} onChange={(e) => { setWithHistory(e.target.checked); }} /> {t('tagArchive.history.include')}</label>
            <button type="submit" className="btn" disabled={busy}>{t('tagArchive.export')}</button>
          </form>
          <p className="hint">{t('tagArchive.format')}</p>

          <form onSubmit={onPreview} className="stack" autoComplete="off">
            <Field label={t('tagArchive.import.file')} help={{ label: t('help.about', { control: t('tagArchive.import.file') }), text: t('help.tagArchiveFile') }}>{(id, describedBy) => <input id={id} aria-describedby={describedBy} type="file" accept=".gpa,application/octet-stream" onChange={(e) => {
              const selected = e.currentTarget.files?.[0];
              e.currentTarget.value = '';
              if (selected === undefined) return;
              invalidate(); setImportPass(''); setMessage(undefined); setFile(selected);
            }} />}</Field>
            <Field label={t('tagArchive.import.passphrase')}>{(id) => <input id={id} type="password" autoComplete="off" value={importPass} onChange={(e) => { invalidate(); setImportPass(e.target.value); }} />}</Field>
            <label><input type="radio" name="tag-import-mode" checked={mode === 'merge'} onChange={() => { invalidate(); setMode('merge'); }} /> {t('tagArchive.import.merge')}</label>
            <label><input type="radio" name="tag-import-mode" checked={mode === 'replace'} onChange={() => { invalidate(); setMode('replace'); }} /> {t('tagArchive.import.replace')}</label>
            <ContextHelp label={t('help.about', { control: t('tagArchive.import.preview') })}>{t('help.archiveMode')}</ContextHelp>
            <button type="submit" className="btn" disabled={busy}>{t('tagArchive.import.preview')}</button>
          </form>
          {staged !== undefined && (
            <div role="status">
              <p>
                {t('tagArchive.import.summary', { total: String(staged.archive.tags.total), added: String(staged.archive.tags.added), updated: String(staged.archive.tags.updated), kept: String(staged.archive.tags.keptLocal), removed: String(staged.archive.tags.removed) })}
                {staged.history.length > 0 && ` ${t('tagArchive.import.historyNote', { count: String(staged.history.length) })}`}
              </p>
              {staged.history.map((h) => <p key={h.chainId}>{t('tagArchive.import.chainLine', { chain: String(h.chainId), records: String(h.preview.recordCount), invalidated: String(h.preview.invalidatedCount) })}{h.preview.readOnly && ` ${t('tagArchive.import.readOnly')}`}</p>)}
              <button type="button" className="btn btn-primary" disabled={busy} onClick={onApply}>{t('tagArchive.import.apply')}</button>{' '}
              <button type="button" className="btn" onClick={reset}>{t('tagArchive.import.discard')}</button>
            </div>
          )}

          <h4>{t('tagArchive.rotate.heading')}</h4>
          {confirm !== 'rotate' ? (
            <button type="button" className="btn" disabled={busy} onClick={() => { setConfirm('rotate'); }}>{t('tagArchive.rotate.heading')}</button>
          ) : (
            <div>
              <p>{t('tagArchive.rotate.warning')}</p>
              <button type="button" className="btn btn-danger" disabled={busy} onClick={onRotate}>{t('tagArchive.rotate.confirm')}</button>{' '}
              <button type="button" className="btn" onClick={() => { setConfirm('none'); }}>{t('sellerKeys.cancel')}</button>
            </div>
          )}

          <h4>{t('tagArchive.wipe.heading')}</h4>
          {confirm !== 'wipe1' && confirm !== 'wipe2' ? (
            <button type="button" className="btn btn-danger" disabled={busy} onClick={() => { setConfirm('wipe1'); }}>{t('tagArchive.wipe.start')}</button>
          ) : confirm === 'wipe1' ? (
            <div>
              <p>{t('tagArchive.wipe.warning')}</p>
              <button type="button" className="btn btn-danger" disabled={busy} onClick={() => { setConfirm('wipe2'); }}>{t('tagArchive.wipe.continue')}</button>{' '}
              <button type="button" className="btn" onClick={() => { setConfirm('none'); }}>{t('sellerKeys.cancel')}</button>
            </div>
          ) : (
            <div>
              <p>{t('tagArchive.wipe.last')}</p>
              <button type="button" className="btn btn-danger" disabled={busy} onClick={onWipe}>{t('tagArchive.wipe.final')}</button>{' '}
              <button type="button" className="btn" onClick={() => { setConfirm('none'); }}>{t('sellerKeys.cancel')}</button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

// i18n-use: tagArchive.msg.listFailed
