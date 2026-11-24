import { useEffect, useState, type ReactNode } from 'react';
import { ATTEMPT_JOURNAL_EVENT, clearAttempt, readAttempts, retryUnwrittenAttempts, unwrittenAttemptsFor, type WalletAttempt } from '../lib/duplicateAttemptJournal';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import { displayMessage, captureUserMessage, type DisplayMessage } from '../lib/errors';
import { Mono, Notice } from './Common';
import { PrivateHistory } from './PrivateHistory';
import type { WalletSession } from '../lib/wallet';

/** Tab-local bookkeeping only; no outcome is inferred from elapsed time or a hash. */
export function WalletAttempts(props: { readonly wallet?: Pick<WalletSession, 'account' | 'chainId'> | undefined }): ReactNode {
  const wallet = props.wallet;
  return <AttemptList key={wallet === undefined ? 'disconnected' : `${String(wallet.chainId)}:${wallet.account.toLowerCase()}`} wallet={wallet} />;
}

function AttemptList({ wallet }: { readonly wallet: Pick<WalletSession, 'account' | 'chainId'> | undefined }): ReactNode {
  const i18n = useI18nOptional();
  const t = i18n?.t ?? SOURCE_TRANSLATOR.t;
  const [hasAttempts, setHasAttempts] = useState(false);
  const [visible, setVisible] = useState<readonly WalletAttempt[]>([]);
  const [unsaved, setUnsaved] = useState(false);
  const [error, setError] = useState<DisplayMessage | undefined>();
  useEffect(() => {
    const refresh = (): void => {
      try {
        if (wallet !== undefined) retryUnwrittenAttempts(wallet.account, wallet.chainId);
        const attempts = readAttempts();
        setUnsaved(false);
        setHasAttempts(attempts.length > 0);
        setVisible(wallet === undefined ? [] : attempts.filter((attempt) =>
          attempt.chainId === wallet.chainId && attempt.account === wallet.account.toLowerCase()));
        setError(undefined);
      } catch (e) {
        const recovery = wallet === undefined ? [] : unwrittenAttemptsFor(wallet.account, wallet.chainId);
        setUnsaved(recovery.length > 0);
        // Even with writes denied, unrelated confirmed records may still be readable.
        try {
          setVisible(wallet === undefined ? [] : readAttempts().filter((row) => row.chainId === wallet.chainId && row.account === wallet.account.toLowerCase()));
        } catch { setVisible(recovery); }
        setError(captureUserMessage(e));
      }
    };
    refresh();
    window.addEventListener(ATTEMPT_JOURNAL_EVENT, refresh);
    return () => { window.removeEventListener(ATTEMPT_JOURNAL_EVENT, refresh); };
  }, [wallet]);
  if (!hasAttempts && error === undefined) return null;
  return <section className="panel" aria-label={t('walletAttempts.aria')}>
    <h3>{t('walletAttempts.heading')}</h3>
    <p className="hint">{t('walletAttempts.hint')}</p>
    {hasAttempts && <Notice kind="warn">{t('walletAttempts.privateWarning')}</Notice>}
    {error !== undefined && <Notice kind="error">{displayMessage(error, t)}</Notice>}
    {wallet === undefined || visible.length === 0 ? <p>{t('walletAttempts.connectToReveal')}</p> :
    <PrivateHistory unlocked scope={wallet}>
    {unsaved && <Notice kind="warn">{t('transaction.detail.saveHash')}</Notice>}
    <ul className="plain-list">{visible.map((attempt) => <li key={attempt.id}>
      <p>{t('walletAttempts.line', { kind: attempt.kind, chainId: String(attempt.chainId) })} · <Mono>{attempt.account}</Mono> · {attempt.hash === undefined ? t('walletAttempts.unknown') : <>{t('walletAttempts.returnedHash')} <Mono>{attempt.hash}</Mono></>}</p>
      <button type="button" className="btn" onClick={() => {
        if (!window.confirm(t('walletAttempts.confirmClear'))) return;
        try { clearAttempt(attempt.id, true); } catch (e) { setError(captureUserMessage(e)); }
      }}>{t('walletAttempts.clear')}</button>
    </li>)}</ul>
    </PrivateHistory>}
  </section>;
}
