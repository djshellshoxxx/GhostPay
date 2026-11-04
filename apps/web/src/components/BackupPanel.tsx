import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react';
import { subscribeAppLock } from '../lib/appLock';
import { userMessage } from '../lib/errors';
import { authorizeKeyExport } from '../lib/keyVault';
import { passphraseProblem } from '../lib/keystore';
import { captureSessionVersionGuard, exportKeystore, getSessionBackup, markKeystoreDownloaded, subscribeSessionBackup } from '../lib/session';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import type { MessageKey } from '../i18n/catalog';
import { useApp } from '../state';
import { Field, Notice, downloadText } from './Common';
import { TagArchive, type ArchiveExportResult } from './TagArchive';

type ItemStatus = 'notStarted' | 'done' | 'partial' | 'failed';

const STATUS_KEY = {
  notStarted: 'backup.status.notStarted',
  done: 'backup.status.done',
  partial: 'backup.status.partial',
  failed: 'backup.status.failed',
} as const satisfies Record<ItemStatus, MessageKey>;

/**
 * Full profile only: one guided checklist for the two things that need a copy outside this tab, the seller keys (an
 * encrypted keystore) and the client tags (the encrypted tag archive). Each item reports what actually happened: "done"
 * only after the export finished and handed its file to the browser, "failed" after an attempt that did not. It adds no
 * cryptography; both exports are the existing ones. The lean profile never imports this module (App.tsx only), so it
 * keeps just the keystore backup in the Seller keys view.
 */
export function BackupPanel(): ReactNode {
  const app = useApp();
  const i18n = useI18nOptional();
  const t = i18n?.t ?? SOURCE_TRANSLATOR.t;
  const backup = useSyncExternalStore(subscribeSessionBackup, getSessionBackup);
  const [keyAttempt, setKeyAttempt] = useState<'none' | 'failed'>('none');
  const [keyError, setKeyError] = useState('');
  const [tags, setTags] = useState<ArchiveExportResult | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [stepUp, setStepUp] = useState('');
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const mounted = useRef(false);
  const run = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  // New keys: what was typed and every earlier outcome belong to other keys.
  useEffect(() => {
    run.current += 1;
    setKeyAttempt('none'); setKeyError(''); setTags(undefined); setBusy(false); setPass(''); setPass2(''); setStepUp(''); setProblem(undefined);
  }, [app.session]);
  useEffect(() => subscribeAppLock(() => { setPass(''); setPass2(''); setStepUp(''); }), []);

  if (app.session === undefined) return <TagArchive />;

  const keyStatus: ItemStatus = keyAttempt === 'failed' ? 'failed' : backup?.backedUp === true ? 'done' : 'notStarted';
  const tagStatus: ItemStatus = tags === undefined ? 'notStarted' : !tags.ok ? 'failed' : tags.gaps ? 'partial' : 'done';

  const onKeys = (e: FormEvent): void => {
    e.preventDefault();
    const weak = passphraseProblem(pass);
    if (weak !== undefined) { setProblem(weak); return; }
    if (pass !== pass2) { setProblem(t('sellerKeys.passphrasesDiffer')); return; }
    setProblem(undefined);
    const id = ++run.current;
    const unchanged = captureSessionVersionGuard();
    const secret = stepUp;
    setBusy(true);
    void (async () => {
      try {
        // Keys tied to a saved vault leave this tab only with that vault's passphrase (L1-02).
        await authorizeKeyExport(secret);
        const text = await exportKeystore(pass);
        if (!mounted.current || run.current !== id) return;
        unchanged();
        downloadText('ghostpay-keystore.json', text, 'application/json');
        markKeystoreDownloaded(unchanged);
        setKeyAttempt('none'); setPass(''); setPass2(''); setStepUp(''); setBusy(false);
      } catch (error) {
        if (!mounted.current || run.current !== id) return;
        setStepUp(''); setBusy(false);
        setKeyError(userMessage(error)); setKeyAttempt('failed');
      }
    })();
  };

  const statusText = (s: ItemStatus): ReactNode => <strong data-status={s}>{t(STATUS_KEY[s])}</strong>;
  const keyNote = keyStatus === 'done' ? t('backup.keys.done') : keyStatus === 'failed' ? t('backup.keys.failed', { reason: keyError }) : t('backup.keys.notStarted');
  const tagNote = tagStatus === 'done' && tags?.ok === true ? t('backup.tags.done', { count: tags.recordCount })
    : tagStatus === 'partial' ? t('backup.tags.partial')
    : tagStatus === 'failed' ? t('backup.tags.failed')
    : t('backup.tags.notStarted');

  return (
    <section className="panel" aria-labelledby="backup-panel-h" data-testid="backup-panel">
      <h3 id="backup-panel-h">{t('backup.title')}</h3>
      <Notice kind="warn">{t('backup.intro')}</Notice>
      <ol className="stack">
        <li data-testid="backup-item-keys">
          <h4>{t('backup.keys.heading')}</h4>
          <p role="status">{statusText(keyStatus)}: {keyNote}</p>
          <form onSubmit={onKeys} className="stack" autoComplete="off">
            <Field label={t('backup.keys.passphrase')}>{(id) => <input id={id} type="password" autoComplete="new-password" value={pass} onChange={(e) => { setPass(e.target.value); }} />}</Field>
            <Field label={t('backup.keys.repeat')}>{(id) => <input id={id} type="password" autoComplete="new-password" value={pass2} onChange={(e) => { setPass2(e.target.value); }} />}</Field>
            {backup?.vaultStepUp === true && (
              <Field label={t('backup.keys.stepUp')}>{(id) => <input id={id} type="password" autoComplete="off" value={stepUp} onChange={(e) => { setStepUp(e.target.value); }} />}</Field>
            )}
            {problem !== undefined && <Notice kind="error">{problem}</Notice>}
            <button type="submit" className="btn" disabled={busy}>{busy ? t('backup.keys.encrypting') : t('backup.keys.download')}</button>
          </form>
        </li>
        <li data-testid="backup-item-tags">
          <h4>{t('backup.tags.heading')}</h4>
          <p role="status">{statusText(tagStatus)}: {tagNote}</p>
          <TagArchive onExport={setTags} />
        </li>
      </ol>
    </section>
  );
}
