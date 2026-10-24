import { useEffect, useState, type ReactNode } from 'react';
import { ATTEMPT_JOURNAL_EVENT, clearAttempt, readAttempts, type WalletAttempt } from '../lib/duplicateAttemptJournal';
import { userMessage } from '../lib/errors';
import { Mono, Notice } from './Common';

/** Tab-local bookkeeping only; no outcome is inferred from elapsed time or a hash. */
export function WalletAttempts(): ReactNode {
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
  return <section className="panel" aria-label="Wallet attempt journal">
    <h3>Wallet attempts in this tab</h3>
    <p className="hint">Unknown outcomes remain here until you check your wallet and explicitly clear them. A returned hash does not prove payment. Clearing this record cannot cancel an in-flight wallet request or roll back a transaction. This journal belongs to this browser tab; it does not protect attempts in other tabs or devices.</p>
    {error !== undefined && <Notice kind="error">{error}</Notice>}
    <ul className="plain-list">{attempts.map((attempt) => <li key={attempt.id}>
      <p>{attempt.kind} on chain {String(attempt.chainId)} · <Mono>{attempt.account}</Mono> · {attempt.hash === undefined ? 'Outcome unknown; check your wallet before retrying.' : <>Returned hash: <Mono>{attempt.hash}</Mono></>}</p>
      <button type="button" className="btn" onClick={() => {
        if (!window.confirm('Have you checked the wallet and chain outcome? Clearing permits another attempt and may cause a duplicate payment. It cannot cancel or roll back an in-flight request. Clear this record?')) return;
        try { clearAttempt(attempt.id, true); } catch (e) { setError(userMessage(e)); }
      }}>Clear this attempt after checking my wallet</button>
    </li>)}</ul>
  </section>;
}
