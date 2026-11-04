import { useSyncExternalStore, useState, type ReactNode } from 'react';
import { getSessionBackup, subscribeSessionBackup } from '../lib/session';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import { useApp } from '../state';
import { Notice } from './Common';
import { TagArchive, type ArchiveExportResult } from './TagArchive';

type ItemStatus = 'notStarted' | 'done' | 'partial' | 'failed';

/** What the last tag archive export of one set of loaded keys did; kept here so leaving the view does not reset the checklist. */
let lastTagOutcome: { readonly session: unknown; readonly result: ArchiveExportResult } | undefined;

/**
 * Full profile only: one guided checklist for the two things that need a copy outside this tab, the seller keys and the
 * client tags. Each item reports what actually happened. Keys are "done" only when the session reports a copy outside
 * this tab (downloaded keystore, imported keys or saved vault), made with the keystore form of this same view; tags are
 * "done" only after the tag archive export finished, "failed" after an attempt that did not. It adds no cryptography and
 * copies no form. The lean profile never imports this module (App.tsx only), so it keeps just the keystore backup.
 */
export function BackupPanel(): ReactNode {
  const app = useApp();
  const i18n = useI18nOptional();
  const t = i18n?.t ?? SOURCE_TRANSLATOR.t;
  const backup = useSyncExternalStore(subscribeSessionBackup, getSessionBackup);
  const [tagResult, setTagResult] = useState(lastTagOutcome);
  if (app.session === undefined) return <TagArchive />;

  // An outcome belongs to the keys it was made for.
  const tags = tagResult?.session === app.session ? tagResult.result : undefined;
  const keyStatus: ItemStatus = backup?.backedUp === true ? 'done' : 'notStarted';
  const tagStatus: ItemStatus = tags === undefined ? 'notStarted' : !tags.ok ? 'failed' : tags.gaps ? 'partial' : 'done';
  const tagNote = tags?.ok === true && !tags.gaps ? (tags.history ? t('backup.tags.done', { count: tags.recordCount }) : t('backup.tags.doneNoHistory', { count: tags.recordCount }))
    : tagStatus === 'partial' ? t('backup.tags.partial')
    : tagStatus === 'failed' ? t('backup.tags.failed')
    : t('backup.tags.notStarted');
  const label = { notStarted: t('backup.status.notStarted'), done: t('backup.status.done'), partial: t('backup.status.partial'), failed: t('backup.status.failed') };
  const status = (s: ItemStatus, note: string): ReactNode => <p role="status"><strong data-status={s}>{label[s]}</strong>: {note}</p>;

  const goToKeystore = (): void => {
    const heading = [...document.querySelectorAll<HTMLElement>('h3')].find((h) => h.textContent === t('sellerKeys.backupHeading'));
    heading?.setAttribute('tabindex', '-1');
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
          <TagArchive onExport={(result) => { lastTagOutcome = { session: app.session, result }; setTagResult(lastTagOutcome); }} />
        </li>
      </ol>
    </section>
  );
}
