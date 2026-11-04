import { useSyncExternalStore, useState, type ReactNode } from 'react';
import { getSessionBackup, subscribeSessionBackup } from '../lib/session';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import type { MessageKey } from '../i18n/catalog';
import { useApp } from '../state';
import { Notice } from './Common';
import { TagArchive, type ArchiveExportResult } from './TagArchive';

type ItemStatus = 'notStarted' | 'done' | 'partial' | 'failed';

const STATUS_KEY = {
  notStarted: 'backup.status.notStarted',
  done: 'backup.status.done',
  partial: 'backup.status.partial',
  failed: 'backup.status.failed',
} as const satisfies Record<ItemStatus, MessageKey>;

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
  const [tagResult, setTagResult] = useState<{ readonly session: unknown; readonly result: ArchiveExportResult } | undefined>(undefined);
  if (app.session === undefined) return <TagArchive />;

  // An outcome belongs to the keys it was made for.
  const tags = tagResult?.session === app.session ? tagResult.result : undefined;
  const keyStatus: ItemStatus = backup?.backedUp === true ? 'done' : 'notStarted';
  const tagStatus: ItemStatus = tags === undefined ? 'notStarted' : !tags.ok ? 'failed' : tags.gaps ? 'partial' : 'done';
  const tagNote = tags?.ok === true && !tags.gaps ? t('backup.tags.done', { count: tags.recordCount })
    : tagStatus === 'partial' ? t('backup.tags.partial')
    : tagStatus === 'failed' ? t('backup.tags.failed')
    : t('backup.tags.notStarted');
  const status = (s: ItemStatus, note: string): ReactNode => <p role="status"><strong data-status={s}>{t(STATUS_KEY[s])}</strong>: {note}</p>;

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
          <h4>{t('backup.keys.heading')}</h4>
          {status(keyStatus, keyStatus === 'done' ? t('backup.keys.done') : t('backup.keys.notStarted'))}
          <button type="button" className="btn" onClick={goToKeystore}>{t('backup.keys.go')}</button>
        </li>
        <li data-testid="backup-item-tags">
          <h4>{t('backup.tags.heading')}</h4>
          {status(tagStatus, tagNote)}
          <TagArchive onExport={(result) => { setTagResult({ session: app.session, result }); }} />
        </li>
      </ol>
    </section>
  );
}
