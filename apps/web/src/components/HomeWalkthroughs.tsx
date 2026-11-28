import type { ReactNode } from 'react';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import { useApp } from '../state';

export function HomeWalkthroughs(): ReactNode {
  const app = useApp();
  const t = useI18nOptional()?.t ?? SOURCE_TRANSLATOR.t;
  return (
    <div className="stack">
      <div>
        {app.session === undefined ? <>
          <button className="btn" type="button" aria-describedby="home-restore-help"
            onClick={() => { app.setView('seller', 'keystore-import'); }}>
            {t('home.restore.action')}
          </button>
          <p id="home-restore-help" className="hint">{t('home.restore.hint')}</p>
        </> : <p>{t('home.restore.loaded')}{' '}
          <button type="button" className="link-btn" onClick={() => { app.setView('seller'); }}>{t('app.nav.seller')}</button>
        </p>}
      </div>
      <details className="panel" id="home-sample">
        <summary>{t('home.sample.action')}</summary>
        <p>{t('home.sample.explain')}</p>
        <dl className="details">
          <dt>{t('pay.invoiceTotal')}</dt><dd><bdi>0.010 ETH</bdi></dd>
          <dt>{t('pay.chain')}</dt><dd>Sepolia</dd>
          <dt>{t('pay.expires')}</dt><dd>{t('home.sample.expiry')}</dd>
          <dt>{t('pay.final.fee')}</dt><dd><bdi>0.0001 ETH</bdi> · {t('pay.feePayer.payer')}</dd>
          <dt>{t('home.sample.total')}</dt><dd><bdi>0.0101 ETH</bdi></dd>
          <dt>{t('pay.wallet')}</dt><dd>{t('home.sample.wallet')}</dd>
        </dl>
      </details>
    </div>
  );
}
