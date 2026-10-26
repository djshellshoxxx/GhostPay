import type { ReactNode } from 'react';
import { ChainFeeList, LIMITS, ObserverTable } from '../components/Disclosure';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';

export function About(): ReactNode {
  const i18n = useI18nOptional();
  const t = i18n?.t ?? SOURCE_TRANSLATOR.t;
  return (
    <section aria-labelledby="about-h">
      <h2 id="about-h">{t('about.title')}</h2>
      <p>
        {t('about.intro')}
      </p>

      <h3>{t('about.hides')}</h3>
      <ul className="plain-list">
        {LIMITS.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>

      <h3>{t('about.learns')}</h3>
      <ObserverTable />

      <h3>{t('about.fees')}</h3>
      <ChainFeeList />
      <p className="hint">
        {t('about.feeNote')}
      </p>

      <h3>{t('about.verify.title')}</h3>
      <p>
        {t('about.verify.intro')}
      </p>
      <ol>
        <li>{t('about.verify.step1')}</li>
        <li>{t('about.verify.step2')}</li>
        <li>{t('about.verify.step3')}</li>
        <li>{t('about.verify.step4')}</li>
        <li>{t('about.verify.step5')}</li>
      </ol>
      <p className="hint">{t('about.noAudit')}</p>
    </section>
  );
}
