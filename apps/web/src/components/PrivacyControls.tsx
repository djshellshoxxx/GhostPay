import { useEffect, useId, useState, type ReactNode } from 'react';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import { savePrivacyMode, usePrivacy } from '../lib/privacyMode';
import { Notice } from './Common';

// Ported from #569 `c30283d2` (components/PrivacyControls.tsx, PrivacyQuickHide.tsx); the preference is a separate
// store on main instead of a Settings field.

const SHORTCUT = 'Alt+Shift+H';

/** Rendered in the shell, outside every privacy boundary, so masking never requires leaving an in-progress workflow. */
export function PrivacyControls(): ReactNode {
  const { enabled, masked, reveal, hide } = usePrivacy();
  const t = useI18nOptional()?.t ?? SOURCE_TRANSLATOR.t;
  const hint = useId();
  const [saved, setSaved] = useState<boolean | undefined>();
  // One-way quick hide: never unlocks history, changes preferences or clears recovery material.
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      // macOS Option layers report a symbol as `key` ('Ó' for H), so the physical H key counts as well.
      if (event.defaultPrevented || event.isComposing || event.repeat || !event.altKey || !event.shiftKey
        || event.ctrlKey || event.metaKey || (event.key.toLowerCase() !== 'h' && event.code !== 'KeyH')) return;
      event.preventDefault();
      hide();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); };
  }, [enabled, hide]);
  return (
    <div className="privacy-controls" role="group" aria-label={t('privacyUx.modeLabel')}>
      <label>
        <input type="checkbox" role="switch" data-privacy-safe-control checked={enabled} aria-describedby={hint}
          onChange={(event) => { hide(); setSaved(savePrivacyMode(event.target.checked)); }} />
        {' '}{t('privacyUx.modeLabel')}
      </label>
      <p className="hint" id={hint}>{t('privacyUx.modeHint')}</p>
      {saved === false && <Notice kind="warn">{t('privacyUx.notSaved')}</Notice>}
      {enabled && <>
        <p role="status">{t(masked ? 'privacyUx.hidden' : 'privacyUx.revealed')}</p>
        <button type="button" className="btn" aria-keyshortcuts={masked ? undefined : SHORTCUT} onClick={masked ? reveal : hide}>
          {masked ? t('privacyUx.reveal') : <>{t('privacyUx.hide')} (<kbd>{SHORTCUT}</kbd>)</>}
        </button>
      </>}
    </div>
  );
}
