import { useState, type ReactNode } from 'react';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import { useApp } from '../state';
import { Field, Notice } from './Common';

/** A local, nonsecret preference remains reachable even while sensitive settings fields are masked. */
export function ClipboardPrivacyControls(): ReactNode {
  const app = useApp();
  const t = useI18nOptional()?.t ?? SOURCE_TRANSLATOR.t;
  const [saved, setSaved] = useState<boolean | undefined>();
  return (
    <div className="stack">
      <Field label={t('settings.clipboard.label')} hint={t('settings.clipboard.hint')}>
        {(id, describedBy) => (
          <select id={id} aria-describedby={describedBy} value={app.settings.clipboardClearAfterMs} onChange={(event) => {
            const delay = Number(event.target.value);
            if (delay !== 0 && delay !== 30_000 && delay !== 60_000 && delay !== 300_000) return;
            setSaved(app.updateSettings({ ...app.settings, clipboardClearAfterMs: delay }));
            app.announce(t('settings.announce'));
          }}>
            <option value={0}>{t('settings.clipboard.off')}</option>
            <option value={30_000}>{t('settings.clipboard.seconds30')}</option>
            <option value={60_000}>{t('settings.clipboard.minute1')}</option>
            <option value={300_000}>{t('settings.clipboard.minutes5')}</option>
          </select>
        )}
      </Field>
      {saved !== undefined && <Notice kind={saved ? 'ok' : 'warn'}>{t(saved ? 'settings.saved' : 'settings.storageUnavailable')}</Notice>}
    </div>
  );
}
