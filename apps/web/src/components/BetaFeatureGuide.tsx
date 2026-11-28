import type { ReactNode } from 'react';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import { useApp, type ViewId } from '../state';
import type { MessageKey } from '../i18n/catalog';
import '../styles/beta-feature-guide.css';

// i18n-use: home.seller.button home.guide.createAction home.pay.button home.guide.scanAction home.sweep.button home.guide.registryAction home.guide.settingsAction home.guide.aboutAction
const destinations = [
  ['seller', 'home.seller.button'],
  ['create', 'home.guide.createAction'],
  ['pay', 'home.pay.button'],
  ['scan', 'home.guide.scanAction'],
  ['sweep', 'home.sweep.button'],
  ['registry', 'home.guide.registryAction'],
  ['settings', 'home.guide.settingsAction'],
  ['about', 'home.guide.aboutAction'],
] as const satisfies ReadonlyArray<readonly [ViewId, MessageKey]>;

// i18n-use: home.guide.seller home.guide.create home.guide.pay home.guide.scan home.guide.sweep home.guide.registry home.guide.settings home.guide.about
export function BetaFeatureGuide(): ReactNode {
  const { setView } = useApp();
  const t = useI18nOptional()?.t ?? SOURCE_TRANSLATOR.t;

  return (
    <div className="beta-guide">
      <p className="beta-guide-intro">{t('home.guide.availability')}</p>
      <ul className="beta-guide-list">
        {destinations.map(([view, label]) => (
          <li key={view}>
            <h3>
              <button type="button" onClick={() => { setView(view); }}>
                {t(label)}<span aria-hidden="true" />
              </button>
            </h3>
            <p>{t(`home.guide.${view}`)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
