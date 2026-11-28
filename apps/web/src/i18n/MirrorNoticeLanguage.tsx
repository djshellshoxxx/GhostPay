import { useEffect } from 'react';
import { useI18n } from './context';
import { directionOf, isReviewed } from './languages';
import { NEUTRAL_KEYS } from './securityKeys';
import type { MessageKey } from './sourceCatalog';
import { SOURCE_CATALOG } from './sourceCatalog';

/** Localize the existing static notice in place. The build exclusively controls profile, chain list and link target. */
export function MirrorNoticeLanguage(): null {
  const { t, locale } = useI18n();
  useEffect(() => {
    const notice = document.getElementById('gp-pages-mirror');
    if (notice === null) return;
    const reviewed = isReviewed(locale) || locale === 'en';
    for (const el of notice.querySelectorAll<HTMLElement>('[data-mirror]')) {
      const key = `pagesMirror.${el.dataset.mirror ?? ''}` as MessageKey;
      if (!Object.hasOwn(SOURCE_CATALOG.messages, key)) continue;
      el.textContent = key === 'pagesMirror.beta' ? t(key, { chains: el.dataset.chains ?? '' }) : t(key);
      el.lang = reviewed || NEUTRAL_KEYS.has(key) ? locale : 'en';
      el.dir = directionOf(el.lang);
    }
    notice.lang = locale;
    notice.dir = directionOf(locale);
    const label = notice.querySelector<HTMLElement>('[data-mirror-language]');
    if (label !== null) {
      label.hidden = reviewed;
      label.textContent = reviewed ? '' : `(${t('pagesMirror.english')})`;
    }
  }, [locale, t]);
  return null;
}

// Static build keys used by scripts/pages/mirror-notice.mjs.
// i18n-use: pagesMirror.title pagesMirror.details pagesMirror.development pagesMirror.demo pagesMirror.beta pagesMirror.testKeys pagesMirror.manifest pagesMirror.shared pagesMirror.integrity pagesMirror.verify
