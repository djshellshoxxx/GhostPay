import { type ReactNode } from 'react';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import { usePrivacy, useTemporaryPrivacyReveal } from '../lib/privacyMode';
import { PrivacyBoundary } from './SensitiveContent';

/** Existing encrypted-vault authority is required before the additional visual history reveal can be granted. */
export function PrivateHistory(props: { readonly unlocked: boolean; readonly scope: unknown; readonly children: ReactNode }): ReactNode {
  const privacy = usePrivacy();
  const t = useI18nOptional()?.t ?? SOURCE_TRANSLATOR.t;
  const { revealed, reveal, hide } = useTemporaryPrivacyReveal(props.scope, privacy.enabled && !privacy.masked && props.unlocked);
  const hidden = privacy.enabled && (!props.unlocked || !revealed);
  return <>
    {privacy.enabled && <div>
      {hidden && <p>{t(props.unlocked ? 'privacyUx.historyHidden' : 'privacyUx.historyLocked')}</p>}
      <p className="hint">{t('privacyUx.historyHint')}</p>
      <button type="button" className="btn" disabled={!props.unlocked || privacy.masked} onClick={hidden ? reveal : hide}>
        {t(hidden ? 'privacyUx.historyReveal' : 'privacyUx.historyHide')}
      </button>
    </div>}
    <PrivacyBoundary hidden={hidden}>{props.children}</PrivacyBoundary>
  </>;
}
