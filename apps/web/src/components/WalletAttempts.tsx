import { CHAINS, type RpcClient } from '@ghostpay/chain-adapters';
import { useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { linkReplacement, resolveAttempt, type AttemptResolution } from '../lib/attemptStatus';
import { clearAttemptLocked, migrateBrowserAttempts, readAttempts, readReturnedAttempts, retryReturnedAttempts, subscribeAttempts, type WalletAttempt } from '../lib/duplicateAttemptJournal';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import type { Translator } from '../i18n/translator';
import { displayMessage, captureUserMessage, UserFacingError, type DisplayMessage } from '../lib/errors';
import { Mono, Notice } from './Common';
import { useWalletDisclosure } from './WalletDisclosure';
import { ServicesContext } from '../lib/services';
import { connectWallet, walletWarnings, type WalletInfo, type WalletSession } from '../lib/wallet';
import { scopeWalletRpc, useWalletPrivacy, type WalletPrivacyScope } from '../lib/useWalletPrivacy';

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
      if (outcome.state !== 'replaced') return result;
      // A cancel (different call) confirming is not the original action confirming: never word it as such.
      // The hash is shown next to the status, outside the live region (#286 item 5).
      return t(outcome.kind === 'different-call' ? 'walletAttempts.replacedDifferent' : 'walletAttempts.replaced', { result });
    }
    case 'pending': return outcome.reorged ? t('walletAttempts.unresolved') : t('walletAttempts.pending');
    case 'mismatch': return t('walletAttempts.mismatch');
    case 'nonce-consumed': return t('walletAttempts.nonceConsumed');
    default: return t('walletAttempts.unresolved');
  }
}

function AttemptRow({ attempt, getRpc, t, capture }: {
  readonly attempt: WalletAttempt;
  readonly getRpc: GetRpc | undefined;
  readonly t: Translator['t'];
  readonly capture: () => WalletPrivacyScope;
}): ReactNode {
  const [outcome, setOutcome] = useState<AttemptResolution>();
  const [replacement, setReplacement] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<DisplayMessage>();
  const mounted = useRef(false);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const lease = (): WalletPrivacyScope => {
    const scope = capture();
    const assertCurrent = (): void => {
      scope.assertCurrent();
      if (!mounted.current) throw new UserFacingError({ key: 'error.wallet.theWalletAccountNetworkOrProviderChangedReconnectAndReview' });
    };
    assertCurrent();
    return { signal: scope.signal, assertCurrent };
  };
  const current = (scope: WalletPrivacyScope | undefined): boolean => {
    try { scope?.assertCurrent(); return mounted.current && scope !== undefined; } catch { return false; }
  };
  const check = async (replacementHash?: string): Promise<void> => {
    let scope: WalletPrivacyScope | undefined;
    try {
      scope = lease();
      setBusy(true);
      setError(undefined);
      setOutcome(undefined);
      const found = await getRpc?.(attempt.chainId);
      scope.assertCurrent();
      if (found === undefined) { setError({ key: 'walletAttempts.rpcRequired' }); return; }
      const rpc = scopeWalletRpc(found, scope);
      const record = replacementHash === undefined ? attempt : await linkReplacement(attempt.id, replacementHash, rpc);
      scope.assertCurrent();
      if (replacementHash !== undefined) setReplacement('');
      const next = await resolveAttempt(rpc, record);
      scope.assertCurrent();
      setOutcome(next);
    } catch (e) {
      if (current(scope)) setError(replacementHash === undefined ? { key: 'walletAttempts.unresolved' } : captureUserMessage(e));
    } finally {
      if (current(scope)) setBusy(false);
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
    {outcome?.state === 'replaced' && <p>{t('walletAttempts.replacementHash')}: <Mono>{outcome.hash}</Mono></p>}
    {error !== undefined && <Notice kind="error">{displayMessage(error, t)}</Notice>}
    <button type="button" className="btn" disabled={busy} onClick={() => {
      let scope: WalletPrivacyScope;
      try { scope = lease(); } catch { return; }
      if (!window.confirm(t('walletAttempts.confirmClear'))) return;
      if (!current(scope)) return;
      setBusy(true);
      setError(undefined);
      void clearAttemptLocked(attempt.id, true)
        .catch((e: unknown) => { if (current(scope)) setError(captureUserMessage(e)); })
        .finally(() => { if (current(scope)) setBusy(false); });
    }}>{t('walletAttempts.clear')}</button>
  </li>;
}

function OwnedAttempts({ wallet, getRpc, t, capture }: {
  readonly wallet: WalletSession;
  readonly getRpc: GetRpc | undefined;
  readonly t: Translator['t'];
  readonly capture: () => WalletPrivacyScope;
}): ReactNode {
  const [attempts, setAttempts] = useState<readonly WalletAttempt[]>([]);
  const [error, setError] = useState<DisplayMessage>();
  const [returned, setReturned] = useState(false);
  const [saving, setSaving] = useState(false);
  const mounted = useRef(false);
  useLayoutEffect(() => {
    mounted.current = true;
    const owns = (attempt: WalletAttempt): boolean => attempt.account === wallet.account.toLowerCase() && attempt.chainId === wallet.chainId;
    const refresh = (): void => {
      if (!mounted.current) return;
      try {
        const pending = readReturnedAttempts().filter(owns);
        setReturned(pending.length > 0);
        try { setAttempts(readAttempts().filter(owns)); setError(undefined); }
        catch (e) { setAttempts(pending); setError(captureUserMessage(e)); }
      } catch (e) { setAttempts([]); setReturned(false); setError(captureUserMessage(e)); }
    };
    const unsubscribe = subscribeAttempts(refresh);
    refresh();
    return () => { mounted.current = false; unsubscribe(); };
  }, [wallet]);
  return <>
    <p className="hint">{t('walletAttempts.hint')}</p>
    {error !== undefined && <Notice kind="error">{displayMessage(error, t)}</Notice>}
    {attempts.length === 0 && error === undefined && <p>{t('walletAttempts.noneForWallet')}</p>}
    {returned && <>
      <Notice kind="warn">{t('walletAttempts.unsaved')}</Notice>
      <button type="button" className="btn" disabled={saving} onClick={() => {
        let scope: WalletPrivacyScope;
        try { scope = capture(); } catch { return; }
        setSaving(true);
        const live = (): boolean => { try { scope.assertCurrent(); return mounted.current; } catch { return false; } };
        void retryReturnedAttempts().catch((e: unknown) => { if (live()) setError(captureUserMessage(e)); })
          .finally(() => { if (live()) setSaving(false); });
      }}>{t('walletAttempts.retrySave')}</button>
    </>}
    <ul className="plain-list">{attempts.map((attempt) => <AttemptRow key={`${attempt.id}:${attempt.hash ?? ''}`} attempt={attempt} getRpc={getRpc} t={t} capture={capture} />)}</ul>
  </>;
}

/** Local bookkeeping across tabs. An explicit connected account and chain are required to reveal its entries. */
export function WalletAttempts({ getRpc, wallet: supplied }: { readonly getRpc?: GetRpc; readonly wallet?: WalletSession | undefined } = {}): ReactNode {
  const t = useI18nOptional()?.t ?? SOURCE_TRANSLATOR.t;
  const services = useContext(ServicesContext);
  const disclosure = useWalletDisclosure();
  const [recovered, setRecovered] = useState<WalletSession>();
  const [revoked] = useState(() => new WeakSet<WalletSession>());
  const [, refreshScope] = useState(0);
  const [wallets, setWallets] = useState<readonly WalletInfo[]>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<DisplayMessage>();
  const [hasEntries, setHasEntries] = useState(false);
  // In-memory returned hashes are evidence for this tab only; their details stay behind the owner connection.
  const [returned, setReturned] = useState<readonly WalletAttempt[]>([]);
  const [saving, setSaving] = useState(false);
  const alive = useRef(false);
  const chains = services?.chains ?? CHAINS.filter((chain) => chain.enabled);
  const [chainId, setChainId] = useState(chains[0]?.chainId);
  const candidate = supplied !== undefined && !revoked.has(supplied) ? supplied : recovered;
  const latest = useRef(candidate); latest.current = candidate;
  const privacy = useWalletPrivacy(candidate, () => {
    if (latest.current !== undefined) revoked.add(latest.current);
    refreshScope((revision) => revision + 1);
    setRecovered(undefined);
    setWallets(undefined);
    setBusy(false);
    setError(undefined);
  });
  const wallet = candidate === undefined || revoked.has(candidate) ? undefined : candidate;
  const [owner, setOwner] = useState({ wallet, generation: 0 });
  if (owner.wallet !== wallet) setOwner({ wallet, generation: owner.generation + 1 });
  useLayoutEffect(() => { setRecovered(undefined); setWallets(undefined); setError(undefined); }, [supplied]);
  useEffect(() => {
    let mounted = true;
    alive.current = true;
    const refresh = (): void => {
      if (!mounted) return;
      try { setHasEntries(readAttempts().length > 0); }
      catch { setHasEntries(true); }
      try { setReturned(readReturnedAttempts()); }
      catch { setReturned([]); }
    };
    const unsubscribe = subscribeAttempts(refresh);
    refresh();
    void migrateBrowserAttempts().catch((e: unknown) => { if (mounted) setError(captureUserMessage(e)); });
    return () => { mounted = false; alive.current = false; unsubscribe(); };
  }, []);
  if (!hasEntries && error === undefined) return null;
  const warnings = walletWarnings(wallets ?? [], t);
  // An unsaved hash the shown owner cannot see (none connected, or another account/chain) still needs this tab open.
  // Say only that one exists: no account, chain, hash or count before the matching owner connects.
  const unownedUnsaved = returned.some((attempt) => wallet === undefined || attempt.account !== wallet.account.toLowerCase() || attempt.chainId !== wallet.chainId);
  const retrySaving = (): void => {
    setSaving(true);
    // Only the existing evidence is written again under a fresh journal lock: no wallet or RPC request.
    void retryReturnedAttempts().catch((e: unknown) => { if (alive.current) setError(captureUserMessage(e)); })
      .finally(() => { if (alive.current) setSaving(false); });
  };
  const connect = async (info: WalletInfo): Promise<void> => {
    if (chainId === undefined) return;
    let scope: WalletPrivacyScope | undefined;
    try {
      scope = privacy.begin(); setBusy(true); setError(undefined);
      const connected = await connectWallet(info, chainId, scope.assertCurrent, scope.signal, { disclosure });
      scope.assertCurrent(); setRecovered(connected); setWallets(undefined);
    } catch (e) {
      if (scope?.signal.aborted !== true) setError(captureUserMessage(e));
    } finally { if (scope?.signal.aborted !== true) setBusy(false); }
  };
  return <section className="panel" aria-label={t('walletAttempts.aria')}>
    <h3>{t('walletAttempts.heading')}</h3>
    {hasEntries && <Notice kind="warn">{t('walletAttempts.privateWarning')}</Notice>}
    {error !== undefined && <Notice kind="error">{displayMessage(error, t)}</Notice>}
    {unownedUnsaved && <>
      <Notice kind="warn">{t('walletAttempts.unsavedOther')}</Notice>
      <button type="button" className="btn" disabled={saving} onClick={retrySaving}>{t('walletAttempts.retrySave')}</button>
    </>}
    {wallet !== undefined
      ? <OwnedAttempts key={owner.generation} wallet={wallet} getRpc={getRpc} t={t} capture={privacy.capture} />
      : <>
        <p>{t('walletAttempts.connectToReveal')}</p>
        {services !== undefined && <>
          <label>{t('walletAttempts.recoveryChain')} <select value={chainId ?? ''} disabled={busy} onChange={(event) => {
            privacy.invalidate(); setChainId(Number(event.target.value));
          }}>{chains.map((chain) => <option key={chain.chainId} value={chain.chainId}>{chain.name}</option>)}</select></label>
          <button type="button" className="btn" disabled={busy || chainId === undefined} onClick={() => {
            let scope: WalletPrivacyScope;
            try { scope = privacy.begin(); } catch (e) { setError(captureUserMessage(e)); return; }
            setBusy(true); setError(undefined);
            void services.discoverWallets().then((found) => { scope.assertCurrent(); setWallets(found); })
              .catch((e: unknown) => { if (!scope.signal.aborted) setError(captureUserMessage(e)); })
              .finally(() => { if (!scope.signal.aborted) setBusy(false); });
          }}>{t('walletAttempts.findWallet')}</button>
          {wallets?.length === 0 && <p>{t('pay.noWallet')}</p>}
          {wallets?.map((info) => <div key={info.id}>
            <button type="button" className="btn" disabled={busy} onClick={() => { void connect(info); }}>{t('pay.connect', { name: info.name })}</button>
            {(warnings.get(info.id) ?? []).map((warning) => <p key={warning} className="hint">{warning}</p>)}
          </div>)}
        </>}
      </>}
  </section>;
}

// i18n-use: walletAttempts.pending walletAttempts.included walletAttempts.confirmed walletAttempts.reverted walletAttempts.replaced walletAttempts.unresolved walletAttempts.rpcRequired
