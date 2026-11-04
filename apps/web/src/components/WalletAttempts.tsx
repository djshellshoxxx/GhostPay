import { useEffect, useState, type ReactNode } from 'react';
import { ATTEMPT_JOURNAL_EVENT, clearAttempt, readAttempts, type WalletAttempt } from '../lib/duplicateAttemptJournal';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import { userMessage } from '../lib/errors';
import { Mono, Notice } from './Common';

/** Tab-local bookkeeping only; no outcome is inferred from elapsed time or a hash. */
export function WalletAttempts(): ReactNode {
  const i18n = useI18nOptional();
  const t = i18n?.t ?? SOURCE_TRANSLATOR.t;
  const [attempts, setAttempts] = useState<readonly WalletAttempt[]>([]);
  const [error, setError] = useState<string | undefined>();
  useEffect(() => {
    const refresh = (): void => {
      try { setAttempts(readAttempts()); setError(undefined); } catch (e) { setError(userMessage(e)); }
    };
    refresh();
    window.addEventListener(ATTEMPT_JOURNAL_EVENT, refresh);
    return () => { window.removeEventListener(ATTEMPT_JOURNAL_EVENT, refresh); };
  }, []);
  if (attempts.length === 0 && error === undefined) return null;
  return <section className="panel" aria-label={t('walletAttempts.aria')}>
    <h3>{t('walletAttempts.heading')}</h3>
    <p className="hint">{t('walletAttempts.hint')}</p>
    {error !== undefined && <Notice kind="error">{error}</Notice>}
    <ul className="plain-list">{attempts.map((attempt) => <li key={attempt.id}>
      <p>{t('walletAttempts.line', { kind: attempt.kind, chainId: String(attempt.chainId) })} · <Mono>{attempt.account}</Mono> · {attempt.hash === undefined ? t('walletAttempts.unknown') : <>{t('walletAttempts.returnedHash')} <Mono>{attempt.hash}</Mono></>}</p>
      <button type="button" className="btn" onClick={() => {
        if (!window.confirm(t('walletAttempts.confirmClear'))) return;
        try { clearAttempt(attempt.id, true); } catch (e) { setError(userMessage(e)); }
      }}>{t('walletAttempts.clear')}</button>
    </li>)}</ul>
  </section>;
}
