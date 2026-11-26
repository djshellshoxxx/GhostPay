import { useEffect, useId, useState, type ReactNode } from 'react';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import type { MessageKey } from '../i18n/catalog';
import { browserCheckEnvironment, runBrowserChecks, type BrowserCheck, type BrowserCheckId, type BrowserCheckStatus } from '../lib/browserChecks';

const LABELS: Readonly<Record<BrowserCheckId, MessageKey>> = {
  secure: 'app.checks.secure',
  digest: 'app.checks.digest',
  storage: 'app.checks.storage',
};

const RESULTS: Readonly<Record<BrowserCheckStatus, MessageKey>> = {
  pass: 'app.checks.pass',
  fail: 'app.checks.fail',
  unavailable: 'app.checks.unavailable',
};

/** What an unsupported or misbehaving capability means for the user; a passing check needs no explanation. */
const EXPLANATIONS: Readonly<Record<BrowserCheckId, Readonly<Record<Exclude<BrowserCheckStatus, 'pass'>, MessageKey>>>> = {
  secure: { fail: 'app.checks.secure.fail', unavailable: 'app.checks.secure.unavailable' },
  digest: { fail: 'app.checks.digest.fail', unavailable: 'app.checks.digest.unavailable' },
  storage: { fail: 'app.checks.storage.fail', unavailable: 'app.checks.storage.unavailable' },
};

/** Local startup/resume diagnostics shared by every view, never a code authenticity or funds-safety claim. */
export function BrowserChecks(): ReactNode {
  const [checks, setChecks] = useState<readonly BrowserCheck[] | undefined>();
  const t = useI18nOptional()?.t ?? SOURCE_TRANSLATOR.t;
  const idPrefix = useId();

  useEffect(() => {
    let disposed = false;
    let generation = 0;
    const refresh = (): void => {
      const run = ++generation;
      void runBrowserChecks(browserCheckEnvironment()).then((result) => {
        if (!disposed && run === generation) setChecks(result);
      });
    };
    const refreshIfVisible = (): void => {
      if (document.visibilityState === 'visible') refresh();
    };
    refresh();
    // Re-evaluate local capabilities after browser sleep / tab resumption and periodically when visible.
    const timer = window.setInterval(refreshIfVisible, 60_000);
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    document.addEventListener('visibilitychange', refreshIfVisible);
    return () => {
      disposed = true;
      ++generation;
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', refresh);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, []);

  const summary = checks === undefined
    ? t('app.checks.running')
    : checks.every((check) => check.status === 'pass')
      ? t('app.checks.ready') : t('app.checks.attention');

  return (
    <section className="browser-checks" aria-label={t('app.checks.title')}>
      <details>
        <summary>{t('app.checks.title')}: {summary}</summary>
        {checks !== undefined && (
          <ul className="browser-checks-list">
            {checks.map((check) => {
              const explainId = `${idPrefix}-${check.id}`;
              return (
                <li key={check.id}>
                  <span>{t(LABELS[check.id])}</span>
                  <strong data-result={check.status} aria-describedby={check.status === 'pass' ? undefined : explainId}>{t(RESULTS[check.status])}</strong>
                  {check.status !== 'pass' && (
                    <p id={explainId} className="browser-checks-explain">{t(EXPLANATIONS[check.id][check.status])}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="browser-checks-limits">{t('app.checks.limits')}</p>
      </details>
    </section>
  );
}
