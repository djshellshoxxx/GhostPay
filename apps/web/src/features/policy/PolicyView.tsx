import type { ChainConfig } from '@ghostpay/chain-adapters';
import type { PolicyRecord } from '@ghostpay/policy-scheme';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Field, Mono, Notice } from '../../components/Common';
import { UserFacingError, userMessage } from '../../lib/errors';
import { useServices } from '../../lib/services';
import { useWalletPrivacy } from '../../lib/useWalletPrivacy';
import { connectWallet, type WalletInfo, type WalletSession } from '../../lib/wallet';
import { useApp } from '../../state';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../../i18n/context';
import { verifyPolicyDeployment, type PolicyChainDeployment } from './chain';
import { POLICY_WARNING } from './flag';
import { PolicyCreate } from './PolicyCreate';
import { PolicyPay } from './PolicyPay';
import { PolicyReceive } from './PolicyReceive';

/** Shared state handed to the sub-sections. */
export interface PolicyCtx {
  readonly chain: ChainConfig;
  readonly deployment: PolicyChainDeployment | undefined;
  readonly wallet: WalletSession | undefined;
  readonly records: readonly PolicyRecord[];
  readonly addRecord: (r: PolicyRecord) => void;
  /** Captured deployment scope; invalidated immediately by edits, re-verification or leaving this view. */
  readonly assertDeploymentCurrent: () => void;
  /** Cancels all app-owned requests that depend on this verified deployment. */
  readonly networkSignal?: AbortSignal;
}

function WalletPicker(props: { readonly chainId: number; readonly assertCurrent: () => void; readonly onConnected: (w: WalletSession) => void }): ReactNode {
  const services = useServices();
  // Test renders without an I18nProvider fall back to the source English catalog.
  const i18n = useI18nOptional();
  const t = i18n?.t ?? SOURCE_TRANSLATOR.t;
  const [wallets, setWallets] = useState<readonly WalletInfo[] | undefined>(undefined);
  const [err, setErr] = useState<string | undefined>(undefined);
  const privacy = useWalletPrivacy(undefined, () => { setWallets(undefined); setErr(undefined); });
  const find = (): void => {
    const scope = privacy.begin();
    setErr(undefined);
    void services.discoverWallets().then((found) => {
      try { scope.assertCurrent(); props.assertCurrent(); } catch { return; }
      setWallets(found);
    }, (e: unknown) => {
      try { scope.assertCurrent(); props.assertCurrent(); } catch { return; }
      setErr(userMessage(e));
    });
  };
  const connect = (selected: WalletInfo): void => {
    const scope = privacy.begin();
    const guard = (): void => { scope.assertCurrent(); props.assertCurrent(); };
    setErr(undefined);
    void connectWallet(selected, props.chainId, guard, scope.signal).then((connected) => {
      try { guard(); } catch { return; }
      props.onConnected(connected);
    }, (e: unknown) => {
      try { guard(); } catch { return; }
      setErr(userMessage(e));
    });
  };
  return (
    <div>
      <button type="button" onClick={find}>
        {t('policy.wallet.find')}
      </button>
      {wallets?.length === 0 && <p>{t('policy.wallet.none')}</p>}
      <ul className="plain">
        {wallets?.map((w) => (
          <li key={w.id}>
            <button type="button" onClick={() => { connect(w); }}>
              {t('policy.wallet.connect', { name: w.name })}
            </button>
          </li>
        ))}
      </ul>
      {err !== undefined && <Notice kind="error">{err}</Notice>}
    </div>
  );
}

/** Experimental scheme 0x47500002 screens. Mounted only when the build flag is on. */
export function PolicyView(): ReactNode {
  const app = useApp();
  const services = useServices();
  // Test renders without an I18nProvider fall back to the source English catalog.
  const i18n = useI18nOptional();
  const t = i18n?.t ?? SOURCE_TRANSLATOR.t;
  const testnets = services.chains.filter((c) => c.testnet && c.enabled);
  const [chainId, setChainId] = useState<number | undefined>(testnets[0]?.chainId);
  const chain = testnets.find((c) => c.chainId === chainId);
  const [factory, setFactory] = useState('');
  const [router, setRouter] = useState('');
  const [deployment, setDeployment] = useState<PolicyChainDeployment | undefined>(undefined);
  const [depErr, setDepErr] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [wallet, setWallet] = useState<WalletSession | undefined>(undefined);
  const [records, setRecords] = useState<readonly PolicyRecord[]>([]);
  const revision = useRef(0);
  const operation = useRef(new AbortController());
  const [scope, setScope] = useState(0);
  useEffect(() => () => { revision.current++; operation.current.abort(); }, []);

  const invalidateDeployment = useCallback((): number => {
    operation.current.abort();
    operation.current = new AbortController();
    const next = ++revision.current;
    setScope(next);
    setDeployment(undefined);
    setDepErr(undefined);
    setBusy(false);
    return next;
  }, []);
  useWalletPrivacy(wallet, () => {
    setWallet(undefined);
    invalidateDeployment();
  });
  useEffect(() => services.network?.subscribe(invalidateDeployment), [services.network, invalidateDeployment]);
  const networkRevision = services.network?.getRevision() ?? 0;

  const verify = async (): Promise<void> => {
    if (chain === undefined) return;
    const started = invalidateDeployment();
    setBusy(true);
    try {
      const client = await app.getRpc(chain.chainId, { action: 'policy', signal: operation.current.signal });
      if (revision.current !== started) return;
      if (client === undefined) throw new Error('no-rpc');
      const verified = await verifyPolicyDeployment(client, chain, { factory, router });
      if (revision.current === started) setDeployment(verified);
    } catch (e) {
      if (revision.current === started) setDepErr(e instanceof Error && e.message === 'no-rpc' ? t('policy.error.noRpc') : userMessage(e));
    } finally {
      if (revision.current === started) setBusy(false);
    }
  };

  const ctx: PolicyCtx | undefined = chain === undefined ? undefined : {
    chain,
    deployment,
    wallet: wallet?.chainId === chain.chainId ? wallet : undefined,
    records,
    networkSignal: operation.current.signal,
    addRecord: (r) => { setRecords((prev) => (prev.some((x) => x.policyHash === r.policyHash) ? prev : [...prev, r])); },
    assertDeploymentCurrent: () => {
      if (revision.current !== scope || deployment === undefined || operation.current.signal.aborted || (services.network?.getRevision() ?? 0) !== networkRevision) throw new UserFacingError(t('policy.error.verifyFirst'));
    },
  };

  return (
    <section aria-labelledby="policy-title">
      <h2 id="policy-title">{t('policy.title')}</h2>
      <Notice kind="warn" title={t('policy.warning.title')}>{POLICY_WARNING}</Notice>
      <p>{t('policy.intro')}</p>

      <h3>{t('policy.network.heading')}</h3>
      {testnets.length === 0 ? <Notice kind="info">{t('policy.network.none')}</Notice> : (
        <>
          <Field label={t('policy.network.label')}>
            {(id) => (
              <select id={id} value={chainId} onChange={(e) => { invalidateDeployment(); setChainId(Number(e.target.value)); }}>
                {testnets.map((c) => <option key={c.chainId} value={c.chainId}>{c.name}</option>)}
              </select>
            )}
          </Field>
          <Notice kind="info">{t('policy.network.notPinned')}</Notice>
          <Field label={t('policy.network.factory')}>{(id) => <input id={id} value={factory} onChange={(e) => { invalidateDeployment(); setFactory(e.target.value); }} spellCheck={false} />}</Field>
          <Field label={t('policy.network.router')}>{(id) => <input id={id} value={router} onChange={(e) => { invalidateDeployment(); setRouter(e.target.value); }} spellCheck={false} />}</Field>
          <button type="button" disabled={busy} onClick={() => { void verify(); }}>{t('policy.network.verify')}</button>
          {depErr !== undefined && <Notice kind="error">{depErr}</Notice>}
          {deployment !== undefined && (
            <dl className="kv" aria-label={t('policy.deployment.aria')}>
              <dt>{t('policy.deployment.factory')}</dt><dd><Mono>{deployment.factory}</Mono></dd>
              <dt>{t('policy.deployment.implementation')}</dt><dd><Mono>{deployment.implementation}</Mono></dd>
              <dt>{t('policy.deployment.router')}</dt><dd><Mono>{deployment.router}</Mono></dd>
              <dt>{t('policy.deployment.feeRecipient')}</dt><dd><Mono>{deployment.feeRecipient}</Mono></dd>
              <dt>{t('policy.deployment.announcer')}</dt><dd><Mono>{deployment.announcer}</Mono></dd>
            </dl>
          )}
          <h3>{t('policy.wallet.heading')}</h3>
          {ctx?.wallet !== undefined ? <p>{t('policy.wallet.connected')} <Mono>{ctx.wallet.account}</Mono></p> : chain !== undefined && <WalletPicker key={`wallet:${String(scope)}`} chainId={chain.chainId} assertCurrent={() => {
            if (revision.current !== scope || operation.current.signal.aborted) throw new UserFacingError({ key: 'error.wallet.theWalletAccountNetworkOrProviderChangedReconnectAndReview' });
          }} onConnected={(w) => { if (revision.current === scope) setWallet(w); }} />}
        </>
      )}

      {ctx !== undefined && (
        <>
          <PolicyCreate ctx={ctx} />
          <PolicyPay key={`pay:${String(scope)}`} ctx={ctx} />
          <PolicyReceive key={`receive:${String(scope)}`} ctx={ctx} />
        </>
      )}
    </section>
  );
}
