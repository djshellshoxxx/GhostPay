import { useEffect, type ReactNode } from 'react';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import { usePrivacy } from '../lib/privacyMode';

const SHORTCUT = 'Alt+Shift+H';

/** One-way visual hiding. This never unlocks history, changes preferences or clears recovery material. */
export function PrivacyQuickHide(): ReactNode {
  const { enabled, hide } = usePrivacy();
  const t = useI18nOptional()?.t ?? SOURCE_TRANSLATOR.t;
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.isComposing || event.repeat || !event.altKey || !event.shiftKey
        || event.ctrlKey || event.metaKey || event.key.toLowerCase() !== 'h') return;
      event.preventDefault();
      hide();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); };
  }, [enabled, hide]);
  if (!enabled) return null;
  return <p>
    <button type="button" className="btn" aria-keyshortcuts={SHORTCUT} onClick={hide}>
      {t('privacyUx.hide')} (<kbd>{SHORTCUT}</kbd>)
    </button>
  </p>;
}
