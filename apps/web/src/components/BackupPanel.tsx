import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { getSessionBackup, subscribeSessionBackup } from '../lib/session';
import { useServices } from '../lib/services';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import { useApp } from '../state';
import { Notice } from './Common';
import { TagArchive, tagFingerprint, type ArchiveExportResult } from './TagArchive';

type ItemStatus = 'notStarted' | 'done' | 'partial' | 'stale' | 'failed';

/** What the last tag archive export of one set of loaded keys did, with its details; kept here so leaving the view does not reset the checklist. */
let lastTagOutcome: { readonly session: unknown; readonly result: ArchiveExportResult } | undefined;

/**
 * Full profile only: one guided checklist for the two things that need a copy outside this tab, the seller keys and the
 * client tags. Each item reports what actually happened. Keys are "done" only when the session reports a copy outside
 * this tab (downloaded keystore, imported keys or saved vault), made with the keystore form of this same view; tags are
 * "done" only after the tag archive export finished and only while the tags are still the ones it was made from
 * (otherwise "changed since last archive"), "failed" after an attempt that did not finish. It adds no cryptography and
 * copies no form. The lean profile never imports this module (App.tsx only), so it keeps just the keystore backup.
 */
export function BackupPanel(): ReactNode {
  const app = useApp();
  const { vault } = useServices();
  const i18n = useI18nOptional();
  const t = i18n?.t ?? SOURCE_TRANSLATOR.t;
  const backup = useSyncExternalStore(subscribeSessionBackup, getSessionBackup);
  const [tagResult, setTagResult] = useState(lastTagOutcome);
  // The tags as they are now, read again on mount, on focus, and after an import or wipe done here (undefined: not read yet).
  const [now, setNow] = useState<string | undefined>(undefined);
  const [tick, setTick] = useState(0);
  // An outcome belongs to the keys it was made for.
  const tags = tagResult !== undefined && tagResult.session === app.session ? tagResult.result : undefined;
  const archived = tags?.ok === true ? tags.fingerprint : undefined;

  useEffect(() => {
    const again = (): void => { setTick((n) => n + 1); };
    window.addEventListener('focus', again);
    document.addEventListener('visibilitychange', again);
    return () => {
      window.removeEventListener('focus', again);
      document.removeEventListener('visibilitychange', again);
    };
  }, []);
  useEffect(() => {
    if (archived === undefined) return undefined;
    let live = true;
    // Unreadable counts as changed: the archive cannot be shown to cover what is stored now.
    void tagFingerprint(vault).catch(() => 'unreadable').then((fingerprint) => { if (live) setNow(fingerprint); });
    return () => { live = false; };
  }, [vault, archived, tick, app.session]);

  if (app.session === undefined) return <TagArchive />;

  const changed = archived !== undefined && now !== undefined && now !== archived;
  const keyStatus: ItemStatus = backup?.backedUp === true ? 'done' : 'notStarted';
  const tagStatus: ItemStatus = tags === undefined ? 'notStarted' : !tags.ok ? 'failed' : changed ? 'stale' : tags.gaps ? 'partial' : 'done';
  const tagNote = tags === undefined ? t('backup.tags.notStarted')
    : !tags.ok ? t('backup.tags.failed', { reason: tags.message })
    : changed ? t('backup.tags.stale', { count: tags.recordCount })
    : tags.gaps ? t('backup.tags.partial')
    : tags.history ? t('backup.tags.done', { count: tags.recordCount })
    : t('backup.tags.doneNoHistory', { count: tags.recordCount });
  const label = { notStarted: t('backup.status.notStarted'), done: t('backup.status.done'), partial: t('backup.status.partial'), stale: t('backup.status.stale'), failed: t('backup.status.failed') };
  const status = (s: ItemStatus, note: string): ReactNode => <p role="status"><strong data-status={s}>{label[s]}</strong>: {note}</p>;

  const goToKeystore = (): void => {
    const heading = document.getElementById('keystore-backup-h');
    heading?.scrollIntoView?.({ block: 'start' });
    heading?.focus();
  };

  return (
    <section className="panel" aria-labelledby="backup-panel-h" data-testid="backup-panel">
      <h3 id="backup-panel-h">{t('backup.title')}</h3>
      <Notice kind="warn">{t('backup.intro')}</Notice>
      <ol className="stack">
        <li data-testid="backup-item-keys">
          <p><strong>{t('backup.keys.heading')}</strong></p>
          {status(keyStatus, keyStatus === 'done' ? t('backup.keys.done') : t('backup.keys.notStarted'))}
          <button type="button" className="btn" onClick={goToKeystore}>{t('backup.keys.go')}</button>
        </li>
        <li data-testid="backup-item-tags">
          <p><strong>{t('backup.tags.heading')}</strong></p>
          {status(tagStatus, tagNote)}
          {tags?.ok === true && tags.notes.length > 0 && <ul>{tags.notes.map((note) => <li key={note}>{note}</li>)}</ul>}
          <TagArchive
            onExport={(result) => { lastTagOutcome = { session: app.session, result }; setTagResult(lastTagOutcome); setNow(undefined); }}
            onTagsChanged={() => { setTick((n) => n + 1); }}
          />
        </li>
      </ol>
    </section>
  );
}
