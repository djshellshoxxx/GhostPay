import { useEffect, useState, type ReactNode } from 'react';
import { ChainFeeList, LIMITS } from '../components/Disclosure';
import { Mono } from '../components/Common';
import { computeReleaseHash, entryScriptUrl } from '../lib/release';
import { useServices } from '../lib/services';
import { useApp } from '../state';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';

export function Home(): ReactNode {
  const app = useApp();
  const services = useServices();
  const i18n = useI18nOptional();
  const t = i18n?.t ?? SOURCE_TRANSLATOR.t;
  const [hash, setHash] = useState<{ file: string; sha256: string } | 'unavailable' | undefined>(undefined);
  useEffect(() => {
    let live = true;
    const src = entryScriptUrl(document);
    if (src === undefined) {
      setHash('unavailable');
      return;
    }
    computeReleaseHash(src, services.fetchFn, window.location.origin).then(
      (h) => {
        if (live) setHash(h);
      },
      () => {
        if (live) setHash('unavailable');
      },
    );
    return () => {
      live = false;
    };
  }, [services]);

  return (
    <section aria-labelledby="home-h">
      <h2 id="home-h">{t('home.title')}</h2>
      <div className="cards">
        <article className="card">
          <h3>{t('home.seller.title')}</h3>
          <p>{t('home.seller.body')}</p>
          <button type="button" className="btn btn-primary" onClick={() => { app.setView('seller'); }}>
            {t('home.seller.button')}
          </button>
        </article>
        <article className="card">
          <h3>{t('home.pay.title')}</h3>
          <p>{t('home.pay.body')}</p>
          <button type="button" className="btn btn-primary" onClick={() => { app.setView('pay'); }}>
            {t('home.pay.button')}
          </button>
        </article>
        <article className="card">
          <h3>{t('home.sweep.title')}</h3>
          <p>{t('home.sweep.body')}</p>
          <button type="button" className="btn btn-primary" onClick={() => { app.setView('sweep'); }}>
            {t('home.sweep.button')}
          </button>
        </article>
      </div>

      <h3>{t('home.limits.title')}</h3>
      <ul className="plain-list">
        {LIMITS.slice(0, 4).map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <p>
        <button type="button" className="link-btn" onClick={() => { app.setView('about'); }}>
          {t('home.readFull')}
        </button>
      </p>

      <h3>{t('home.fees')}</h3>
      <ChainFeeList />

      <h3>{t('home.release.title')}</h3>
      <p>
        {t('home.release.label')}{' '}
        {hash === undefined ? t('home.release.computing') : hash === 'unavailable' ? t('home.release.unavailable') : (
          <>
            <Mono>{hash.sha256}</Mono> ({hash.file})
          </>
        )}
      </p>
      <p className="hint">{t('home.release.compare')}</p>
    </section>
  );
}
