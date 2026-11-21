import { useId, useState, type ReactNode } from 'react';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import { usePrivacy } from '../lib/privacyMode';
import { useApp } from '../state';
import { Notice } from './Common';

/** Also rendered in the shell, so masking an in-progress workflow never requires navigating away from it. */
export function PrivacyControls(): ReactNode {
  const app = useApp();
  const { masked, reveal, hide } = usePrivacy();
  const t = useI18nOptional()?.t ?? SOURCE_TRANSLATOR.t;
  const hint = useId();
  const [saved, setSaved] = useState<boolean | undefined>();
  return (
    <div role="group" aria-label={t('privacyUx.modeLabel')}>
      <label>
        <input type="checkbox" role="switch" data-privacy-safe-control checked={app.settings.privacyMode} aria-describedby={hint}
          onChange={(event) => { hide(); setSaved(app.updateSettings({ ...app.settings, privacyMode: event.target.checked })); }} />
        {' '}{t('privacyUx.modeLabel')}
      </label>
      <p className="hint" id={hint}>{t('privacyUx.modeHint')}</p>
      {saved === false && <Notice kind="warn">{t('settings.storageUnavailable')}</Notice>}
      {app.settings.privacyMode && <>
        <p role="status">{t(masked ? 'privacyUx.hidden' : 'privacyUx.revealed')}</p>
        <button type="button" className="btn" onClick={masked ? reveal : hide}>{t(masked ? 'privacyUx.reveal' : 'privacyUx.hide')}</button>
      </>}
    </div>
  );
}
