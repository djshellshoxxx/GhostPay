import { buildLookupCall, buildRegisterKeysCall, ERC6538_REGISTRY_ADDRESS, lookupMetaAddress, verifyRegistry, type RegistryCall } from '@ghostpay/chain-adapters';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CopyButton, Field, Mono, Notice } from '../../components/Common';
import { userMessage } from '../../lib/errors';
import { useServices } from '../../lib/services';
import { connectWallet, sendViaWallet, verifySubmission, WalletBroadcastError, type WalletInfo, type WalletSession } from '../../lib/wallet';
import { useApp } from '../../state';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../../i18n/context';
import { buildClearRegistryCall } from '../../lib/registry';
import { captureSessionGuard } from '../../lib/session';
import { WalletAttempts } from '../../components/WalletAttempts';
import { CameraImporter } from '../../components/CameraImporter';
import { parsePublicMetaQr } from '../../lib/qrPayload';

type Msg = { readonly kind: 'ok' | 'error' | 'warn'; readonly text: string };

function CallPreview(props: { readonly call: RegistryCall; readonly chainName: string }): ReactNode {
  const p = props.call.preview;
  const i18n = useI18nOptional();
  const t = i18n?.t ?? SOURCE_TRANSLATOR.t;
  return (
    <dl className="kv">
      <dt>{t('registry.call.network')}</dt>
      <dd>{props.chainName}</dd>
      <dt>{t('registry.call.contract')}</dt>
      <dd><Mono>{p.contract}</Mono></dd>
      <dt>{t('registry.call.function')}</dt>
      <dd><Mono>{p.function}</Mono> {t('registry.call.schemeId', { id: p.schemeId.toString() })}</dd>
      {p.metaAddress !== undefined && (
        <>
          <dt>{t('registry.call.metaStored')}</dt>
          <dd><Mono>{p.metaAddress}</Mono></dd>
        </>
      )}
      {p.registrant !== undefined && (
        <>
          <dt>{t('registry.call.registrant')}</dt>
          <dd><Mono>{p.registrant}</Mono></dd>
        </>
      )}
      <dt>{t('registry.call.value')}</dt>
      <dd>{t('registry.call.valueZero')}</dd>
      <dt>{t('registry.call.data')}</dt>
      <dd><Mono>{props.call.data}</Mono></dd>
    </dl>
  );
}

/** ERC-6538 registry: publish your meta-address (explicit consent) and look up a payee's meta-address. */
export function RegistryView(): ReactNode {
  const app = useApp();
  const services = useServices();
  const i18n = useI18nOptional();
  const t = i18n?.t ?? SOURCE_TRANSLATOR.t;
  const chains = [...services.chains].sort((a, b) => Number(b.testnet) - Number(a.testnet));
  const [chainId, setChainId] = useState<number | undefined>(chains[0]?.chainId);
  const chain = chains.find((c) => c.chainId === chainId);
  const [consent, setConsent] = useState(false);
  const [wallets, setWallets] = useState<readonly WalletInfo[] | undefined>(undefined);
  const [wallet, setWallet] = useState<WalletSession | undefined>(undefined);
  const [reviewed, setReviewed] = useState<RegistryCall | undefined>(undefined);
  const [reviewAction, setReviewAction] = useState<'publish' | 'clear' | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [pub, setPub] = useState<Msg | undefined>(undefined);
  const [who, setWho] = useState('');
  const [found, setFound] = useState<{ readonly meta: string | undefined; readonly call: RegistryCall } | undefined>(undefined);
  const [look, setLook] = useState<Msg | undefined>(undefined);
  const [scannedMeta, setScannedMeta] = useState<string | undefined>();
  const [scanError, setScanError] = useState<string | undefined>();

  // Any change to chain, consent or keys invalidates a prepared review and the wallet connection.
  const metaAddress = app.session?.metaAddress;
  useEffect(() => {
    setReviewed(undefined);
    setReviewAction(undefined);
    setWallet(undefined);
  }, [chainId, consent, metaAddress]);

  const mounted = useRef(true);
  const busyRef = useRef(false);
  const latest = useRef({ chainId, consent, metaAddress, wallet, reviewed, reviewAction, session: app.session, settings: app.settings, who });
  latest.current = { chainId, consent, metaAddress, wallet, reviewed, reviewAction, session: app.session, settings: app.settings, who };
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => { setConsent(false); }, [chainId, app.session]);
  const captureAuthority = (): (() => void) => {
    const expected = latest.current;
    const guardSession = captureSessionGuard();
    return () => {
      guardSession();
      const current = latest.current;
      if (!mounted.current || !current.consent || current.chainId !== expected.chainId || current.session !== expected.session ||
          current.metaAddress !== expected.metaAddress || current.wallet !== expected.wallet || current.reviewed !== expected.reviewed ||
          current.reviewAction !== expected.reviewAction || current.settings !== expected.settings) {
        throw new Error(t('registry.sessionChanged'));
      }
    };
  };

  const rpcFor = async (): Promise<NonNullable<Awaited<ReturnType<typeof app.getRpc>>>> => {
    if (chainId === undefined) throw new Error('chain');
    const rpc = await app.getRpc(chainId);
    if (rpc === undefined) throw new Error('rpc');
    return rpc;
  };
  const rpcMissing = (e: unknown): boolean => e instanceof Error && e.message === 'rpc';
  const noRpc: Msg = { kind: 'error', text: t('registry.noRpc') };

  const onDiscover = (): void => {
    setPub(undefined);
    void services.discoverWallets().then(setWallets, () => {
      setWallets([]);
    });
  };

  const onConnect = (w: WalletInfo): void => {
    if (chainId === undefined || !consent || metaAddress === undefined || busyRef.current) return;
    const guard = captureAuthority();
    setPub({ kind: 'ok', text: t('registry.waiting') });
    connectWallet(w, chainId).then(
      (connected) => {
        try { guard(); } catch { return; }
        setWallet(connected);
        setPub(undefined);
        app.announce(t('registry.walletConnected'));
      },
      (e: unknown) => {
        try { guard(); } catch { return; }
        setPub({ kind: 'error', text: userMessage(e) });
      },
    );
  };

  const onReview = (action: 'publish' | 'clear'): void => {
    if (metaAddress === undefined || !consent || wallet === undefined || busyRef.current) return;
    const guard = captureAuthority();
    busyRef.current = true;
    setBusy(true);
    void (async () => {
      try {
        const rpc = await rpcFor();
        guard();
        await verifyRegistry(rpc);
        guard();
        setReviewed(action === 'publish' ? buildRegisterKeysCall(metaAddress) : buildClearRegistryCall());
        setReviewAction(action);
        setPub(undefined);
      } catch (e) {
        try { guard(); } catch { return; }
        setPub(rpcMissing(e) ? noRpc : { kind: 'error', text: userMessage(e) });
      } finally {
        busyRef.current = false;
        if (mounted.current) setBusy(false);
      }
    })();
  };

  const onPublish = (): void => {
    if (wallet === undefined || reviewed === undefined || reviewAction === undefined || chainId === undefined || metaAddress === undefined || !consent || busyRef.current) return;
    const guard = captureAuthority();
    busyRef.current = true;
    setBusy(true);
    void (async () => {
      let returnedHash: string | undefined;
      try {
        const rpc = await rpcFor();
        guard();
        await verifyRegistry(rpc);
        guard();
        const expected = reviewAction === 'publish' ? buildRegisterKeysCall(metaAddress) : buildClearRegistryCall();
        if (expected.to !== reviewed.to || expected.data !== reviewed.data || expected.value !== reviewed.value) throw new Error(t('registry.txChanged'));
        const hash = await sendViaWallet(wallet, expected, guard, { kind: 'registry' });
        returnedHash = hash;
        // The journal already retained this hash, even if the user changed sessions while the wallet was open.
        guard();
        const check = await verifySubmission(rpc, hash, { from: wallet.account, to: expected.to, data: expected.data, value: 0n, chainId }, services.sleep);
        guard();
        setReviewed(undefined);
        setReviewAction(undefined);
        setPub({
          kind: check === 'verified' ? 'ok' : 'warn',
          text: `${t('registry.submitted', { what: reviewAction === 'publish' ? t('registry.what.registration') : t('registry.what.clear'), hash })} ${check === 'verified' ? t('registry.verified') : t('registry.notSeen')}${reviewAction === 'clear' ? ` ${t('registry.clearNote')}` : ''}`,
        });
        app.announce(t('registry.announceSubmitted', { what: reviewAction === 'publish' ? t('registry.what.registration') : t('registry.what.clear') }));
      } catch (e) {
        if (e instanceof WalletBroadcastError) returnedHash = e.hash;
        if (!mounted.current) return;
        if (returnedHash !== undefined) {
          setPub({ kind: 'warn', text: t('registry.walletReturned', { hash: returnedHash }) });
          return;
        }
        try { guard(); } catch { return; }
        setPub(rpcMissing(e) ? noRpc : { kind: 'error', text: userMessage(e) });
      } finally {
        busyRef.current = false;
        if (mounted.current) setBusy(false);
      }
    })();
  };

  const onLookup = (): void => {
    const expected = latest.current;
    const isCurrent = (): boolean => mounted.current && latest.current.chainId === expected.chainId && latest.current.who === expected.who && latest.current.settings === expected.settings;
    setFound(undefined);
    setLook(undefined);
    setBusy(true);
    void (async () => {
      try {
        const call = buildLookupCall(who.trim());
        const rpc = await rpcFor();
        await verifyRegistry(rpc);
        if (!isCurrent()) return;
        const meta = await lookupMetaAddress(rpc, who.trim());
        if (!isCurrent()) return;
        setFound({ meta, call });
      } catch (e) {
        if (isCurrent()) setLook(rpcMissing(e) ? noRpc : { kind: 'error', text: userMessage(e) });
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <section aria-labelledby="reg-h">
      <h2 id="reg-h">{t('registry.title')}</h2>
      <WalletAttempts />
      <p className="hint">
        {t('registry.canonical')} <Mono>{ERC6538_REGISTRY_ADDRESS}</Mono>{t('registry.canonicalTail')}
      </p>
      <Field label={t('registry.network')}>
        {(id) => (
          <select id={id} value={chainId ?? ''} onChange={(e) => { setChainId(Number(e.target.value)); }}>
            {chains.map((c) => <option key={c.chainId} value={c.chainId}>{c.name}</option>)}
          </select>
        )}
      </Field>

      <h3>{t('registry.publishHeading')}</h3>
      {metaAddress === undefined ? (
        <p>{t('registry.loadKeysFirst')}</p>
      ) : (
        <>
          <Notice kind="warn" title={t('registry.publicAssoc.title')}>
            {t('registry.publicAssoc.body')}
          </Notice>
          <p>{t('registry.toPublish')} <Mono>{metaAddress}</Mono></p>
          <p>
            <label>
              <input type="checkbox" checked={consent} onChange={(e) => { setConsent(e.target.checked); }} /> {t('registry.consent')}
            </label>
          </p>
          {consent && wallet === undefined && (
            <>
              <p><button type="button" className="btn" onClick={onDiscover}>{t('registry.findWallets')}</button></p>
              {wallets?.length === 0 && <Notice kind="warn">{t('registry.noWallet')}</Notice>}
              {wallets?.map((w) => (
                <button key={w.id} type="button" className="btn" onClick={() => { onConnect(w); }}>{t('registry.connect', { name: w.name })}</button>
              ))}
            </>
          )}
          {wallet !== undefined && <p>{t('registry.walletLabel')} <Mono>{wallet.account}</Mono> {t('registry.onChain', { chain: chain?.name ?? String(wallet.chainId) })}</p>}
          {wallet !== undefined && reviewed === undefined && (
            <div className="actions">
              <button type="button" className="btn" disabled={busy || !consent} onClick={() => { onReview('publish'); }}>{t('registry.reviewPublish')}</button>
              <button type="button" className="btn" disabled={busy || !consent} onClick={() => { onReview('clear'); }}>{t('registry.reviewClear')}</button>
            </div>
          )}
          {reviewed !== undefined && chain !== undefined && (
            <>
              <h4>{t('registry.reviewHeading')}</h4>
              <CallPreview call={reviewed} chainName={chain.name} />
              <button type="button" className="btn btn-primary" disabled={busy || !consent} onClick={onPublish}>{reviewAction === 'clear' ? t('registry.clearEntry') : t('registry.publishEntry')}</button>
            </>
          )}
        </>
      )}
      {pub !== undefined && <Notice kind={pub.kind}>{pub.text}</Notice>}

      <section className="panel" aria-label="Public meta-address QR review">
        <h3>{t('registry.qrHeadingH3')}</h3>
        <p className="hint">{t('registry.qrHint')}</p>
        <CameraImporter key={chainId} label={t('registry.qrLabel')} scopeKey={app.session}
          onInputChange={() => { setScannedMeta(undefined); setScanError(undefined); }}
          onText={(text, signal) => {
            if (signal.aborted) return false;
            try { setScannedMeta(parsePublicMetaQr(text)); setScanError(undefined); return true; }
            catch (e) { setScannedMeta(undefined); setScanError(userMessage(e)); return false; }
          }} />
        {scanError !== undefined && <Notice kind="error">{scanError}</Notice>}
        {scannedMeta !== undefined && <><h4>{t('registry.scannedHeading')}</h4><p><Mono>{scannedMeta}</Mono></p><CopyButton text={scannedMeta} label={t('registry.copyScanned')} /></>}
      </section>

      <h3>{t('registry.lookupHeadingH3')}</h3>
      <Field label={t('registry.lookupLabel')}>
        {(id) => <input id={id} type="text" autoComplete="off" spellCheck={false} value={who} onChange={(e) => { setWho(e.target.value); }} />}
      </Field>
      <button type="button" className="btn" disabled={busy || who.trim() === ''} onClick={onLookup}>{t('registry.lookup')}</button>
      {look !== undefined && <Notice kind={look.kind}>{look.text}</Notice>}
      {found !== undefined && chain !== undefined && (
        <>
          <h4>{t('registry.readOnlyHeading')}</h4>
          <CallPreview call={found.call} chainName={chain.name} />
          {found.meta === undefined ? (
            <Notice kind="info">{t('registry.notRegistered', { chain: chain.name })}</Notice>
          ) : (
            <>
              <Notice kind="info" title={t('registry.registeredBy.title')}>
                {t('registry.registeredBy.body')}
              </Notice>
              <p><Mono>{found.meta}</Mono></p>
              <p><CopyButton text={found.meta} label="Copy meta-address" /></p>
            </>
          )}
        </>
      )}
    </section>
  );
}
