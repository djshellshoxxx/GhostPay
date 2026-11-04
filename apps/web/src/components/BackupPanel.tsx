import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { getSessionBackup, subscribeSessionBackup } from '../lib/session';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import { useApp } from '../state';
import { Notice } from './Common';
import { TagArchive, type ArchiveExportResult } from './TagArchive';

type ItemStatus = 'notStarted' | 'done' | 'downloaded' | 'downloadedGaps' | 'deleted' | 'failed';

/** What the last tag archive export of one set of loaded keys did, with its details; kept here so leaving the view does not reset the checklist. */
let lastTagOutcome: { readonly session: unknown; readonly result: ArchiveExportResult; readonly at: number; /** Tags were deleted in this panel after the archive. */ readonly deleted: boolean } | undefined;

/**
 * Full profile only: one guided checklist for the two things that need a copy outside this tab, the seller keys and the
 * client tags. Keys are "done" only when the session reports a copy outside this tab (downloaded keystore, imported keys
 * or saved vault), made with the keystore form of this same view. The tag item never says "done": the tags can change
 * afterwards, here or in another tab, and nothing here can see that without unlocking them. It states facts instead: what
 * the last archive held and when, that later changes are not in it, and what is missing or failed. It adds no cryptography
 * and copies no form. The lean profile never imports this module (App.tsx only), so it keeps just the keystore backup.
 */
export function BackupPanel(): ReactNode {
  const app = useApp();
  const i18n = useI18nOptional();
  const t = i18n?.t ?? SOURCE_TRANSLATOR.t;
  const backup = useSyncExternalStore(subscribeSessionBackup, getSessionBackup);
  const [tagResult, setTagResult] = useState(lastTagOutcome);
  // Keys that replaced the ones an outcome belongs to also end it.
  useEffect(() => {
    if (lastTagOutcome !== undefined && lastTagOutcome.session !== app.session) {
      lastTagOutcome = undefined;
      setTagResult(undefined);
    }
  }, [app.session]);

  if (app.session === undefined) return <TagArchive />;

  const tags = tagResult !== undefined && tagResult.session === app.session ? tagResult : undefined;
  const result = tags?.result;
  const keyStatus: ItemStatus = backup?.backedUp === true ? 'done' : 'notStarted';
  const tagStatus: ItemStatus = result === undefined ? 'notStarted'
    : !result.ok ? 'failed'
    : tags?.deleted === true && result.recordCount > 0 ? 'deleted'
    : result.gaps ? 'downloadedGaps' : 'downloaded';
  const time = tags === undefined ? '' : new Date(tags.at).toLocaleString();
  const tagNote = result === undefined ? t('backup.tags.notStarted')
    : !result.ok ? t('backup.tags.failed', { reason: result.message })
    : tagStatus === 'deleted' ? t('backup.tags.deleted', { count: result.recordCount })
    : result.gaps ? t('backup.tags.partial', { time, count: result.recordCount })
    : result.history ? t('backup.tags.archived', { time, count: result.recordCount })
    : t('backup.tags.archivedNoHistory', { time, count: result.recordCount });
  const label = {
    notStarted: t('backup.status.notStarted'),
    done: t('backup.status.done'),
    downloaded: t('backup.status.downloaded'),
    downloadedGaps: t('backup.status.downloadedGaps'),
    deleted: t('backup.status.deleted'),
    failed: t('backup.status.failed'),
  };
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
          {result?.ok === true && result.notes.length > 0 && <ul>{result.notes.map((note) => <li key={note}>{note}</li>)}</ul>}
          <TagArchive
            onExport={(next) => { lastTagOutcome = { session: app.session, result: next, at: Date.now(), deleted: false }; setTagResult(lastTagOutcome); }}
            onTagsWiped={() => {
              if (lastTagOutcome !== undefined) { lastTagOutcome = { ...lastTagOutcome, deleted: true }; setTagResult(lastTagOutcome); }
            }}
          />
        </li>
      </ol>
    </section>
  );
}
