import { CHAINS, type RpcClient } from '@ghostpay/chain-adapters';
import { useEffect, useState, type ReactNode } from 'react';
import { linkReplacement, resolveAttempt, type AttemptResolution } from '../lib/attemptStatus';
import { clearAttemptLocked, migrateBrowserAttempts, readAttempts, subscribeAttempts, type WalletAttempt } from '../lib/duplicateAttemptJournal';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import type { Translator } from '../i18n/translator';
import { displayMessage, captureUserMessage, type DisplayMessage } from '../lib/errors';
import { Mono, Notice } from './Common';

type GetRpc = (chainId: number) => Promise<RpcClient | undefined>;

function statusText(outcome: AttemptResolution, attempt: WalletAttempt, t: Translator['t']): string {
  switch (outcome.state) {
    case 'confirmed':
    case 'reverted':
    case 'replaced': {
      const observed = outcome.state === 'replaced' ? outcome.outcome : outcome;
      const depth = CHAINS.find((chain) => chain.chainId === attempt.chainId)?.finalityDepth;
      const result = observed.state === 'pending' ? t('walletAttempts.pending')
        : depth === undefined || observed.confirmations < BigInt(depth) ? t('walletAttempts.included')
        : observed.state === 'reverted' ? t('walletAttempts.reverted') : t('walletAttempts.confirmed');
      return outcome.state === 'replaced' ? t('walletAttempts.replaced', { hash: outcome.hash, result }) : result;
    }
    case 'pending': return outcome.reorged ? t('walletAttempts.unresolved') : t('walletAttempts.pending');
    default: return t('walletAttempts.unresolved');
  }
}

function AttemptRow({ attempt, getRpc, t }: {
  readonly attempt: WalletAttempt;
  readonly getRpc: GetRpc | undefined;
  readonly t: Translator['t'];
}): ReactNode {
  const [outcome, setOutcome] = useState<AttemptResolution>();
  const [replacement, setReplacement] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<DisplayMessage>();

  const check = async (replacementHash?: string): Promise<void> => {
    setBusy(true);
    setError(undefined);
    setOutcome(undefined);
    try {
      const rpc = await getRpc?.(attempt.chainId);
      if (rpc === undefined) {
        setError({ key: 'walletAttempts.rpcRequired' });
        return;
      }
      const record = replacementHash === undefined ? attempt : await linkReplacement(attempt.id, replacementHash, rpc);
      if (replacementHash !== undefined) setReplacement('');
      setOutcome(await resolveAttempt(rpc, record));
    } catch (e) {
      setError(replacementHash === undefined ? { key: 'walletAttempts.unresolved' } : captureUserMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return <li>
    <p>{t('walletAttempts.line', { kind: attempt.kind, chainId: String(attempt.chainId) })} · <Mono>{attempt.account}</Mono> · {attempt.hash === undefined ? t('walletAttempts.unknown') : <>{t('walletAttempts.returnedHash')} <Mono>{attempt.hash}</Mono></>}</p>
    {attempt.hash !== undefined && getRpc !== undefined && <>
      <button type="button" className="btn" disabled={busy} onClick={() => { void check(); }}>{t('walletAttempts.check')}</button>
      <details>
        <summary>{t('walletAttempts.replacement')}</summary>
        <label>
          {t('walletAttempts.replacementHash')}
          <input dir="ltr" autoComplete="off" spellCheck={false} maxLength={66} value={replacement} onChange={(event) => { setReplacement(event.target.value); }} />
        </label>
        <button type="button" className="btn" disabled={busy || replacement.trim() === ''} onClick={() => { void check(replacement); }}>{t('walletAttempts.link')}</button>
      </details>
    </>}
    {outcome !== undefined && <p role="status" className="status">{statusText(outcome, attempt, t)}</p>}
    {error !== undefined && <Notice kind="error">{displayMessage(error, t)}</Notice>}
    <button type="button" className="btn" disabled={busy} onClick={() => {
      if (!window.confirm(t('walletAttempts.confirmClear'))) return;
      setBusy(true);
      setError(undefined);
      void clearAttemptLocked(attempt.id, true)
        .catch((e: unknown) => { setError(captureUserMessage(e)); })
        .finally(() => { setBusy(false); });
    }}>{t('walletAttempts.clear')}</button>
  </li>;
}

/** Local bookkeeping across tabs of this browser profile. Chain lookups are user-initiated. */
export function WalletAttempts({ getRpc }: { readonly getRpc?: GetRpc } = {}): ReactNode {
  const i18n = useI18nOptional();
  const t = i18n?.t ?? SOURCE_TRANSLATOR.t;
  const [attempts, setAttempts] = useState<readonly WalletAttempt[]>([]);
  const [error, setError] = useState<DisplayMessage>();
  useEffect(() => {
    const refresh = (): void => {
      try { setAttempts(readAttempts()); setError(undefined); }
      catch (e) { setAttempts([]); setError(captureUserMessage(e)); }
    };
    let mounted = true;
    const unsubscribe = subscribeAttempts(refresh);
    refresh();
    void migrateBrowserAttempts().catch((e: unknown) => {
      if (mounted) setError(captureUserMessage(e));
    });
    return () => { mounted = false; unsubscribe(); };
  }, []);
  if (attempts.length === 0 && error === undefined) return null;
  return <section className="panel" aria-label={t('walletAttempts.aria')}>
    <h3>{t('walletAttempts.heading')}</h3>
    <p className="hint">{t('walletAttempts.hint')}</p>
    {error !== undefined && <Notice kind="error">{displayMessage(error, t)}</Notice>}
    <ul className="plain-list">{attempts.map((attempt) => <AttemptRow key={attempt.id} attempt={attempt} getRpc={getRpc} t={t} />)}</ul>
  </section>;
}

// i18n-use: walletAttempts.pending walletAttempts.included walletAttempts.confirmed walletAttempts.reverted walletAttempts.replaced walletAttempts.unresolved walletAttempts.rpcRequired
