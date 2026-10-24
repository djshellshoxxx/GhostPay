import { buildLookupCall, buildRegisterKeysCall, ERC6538_REGISTRY_ADDRESS, lookupMetaAddress, verifyRegistry, type RegistryCall } from '@ghostpay/chain-adapters';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CopyButton, Field, Mono, Notice } from '../../components/Common';
import { userMessage } from '../../lib/errors';
import { useServices } from '../../lib/services';
import { connectWallet, sendViaWallet, verifySubmission, WalletBroadcastError, type WalletInfo, type WalletSession } from '../../lib/wallet';
import { useApp } from '../../state';
import { buildClearRegistryCall } from '../../lib/registry';
import { captureSessionGuard } from '../../lib/session';
import { WalletAttempts } from '../../components/WalletAttempts';
import { CameraImporter } from '../../components/CameraImporter';
import { parsePublicMetaQr } from '../../lib/qrPayload';

type Msg = { readonly kind: 'ok' | 'error' | 'warn'; readonly text: string };

function CallPreview(props: { readonly call: RegistryCall; readonly chainName: string }): ReactNode {
  const p = props.call.preview;
  return (
    <dl className="kv">
      <dt>Network</dt>
      <dd>{props.chainName}</dd>
      <dt>Registry contract</dt>
      <dd><Mono>{p.contract}</Mono></dd>
      <dt>Function</dt>
      <dd><Mono>{p.function}</Mono> with scheme id {p.schemeId.toString()}</dd>
      {p.metaAddress !== undefined && (
        <>
          <dt>Meta-address stored</dt>
          <dd><Mono>{p.metaAddress}</Mono></dd>
        </>
      )}
      {p.registrant !== undefined && (
        <>
          <dt>Registrant</dt>
          <dd><Mono>{p.registrant}</Mono></dd>
        </>
      )}
      <dt>Value</dt>
      <dd>0 (network fee only)</dd>
      <dt>Call data</dt>
      <dd><Mono>{props.call.data}</Mono></dd>
    </dl>
  );
}

/** ERC-6538 registry: publish your meta-address (explicit consent) and look up a payee's meta-address. */
export function RegistryView(): ReactNode {
  const app = useApp();
  const services = useServices();
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
        throw new Error('The registry session, network, wallet or consent changed. Review the action again.');
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
  const noRpc: Msg = { kind: 'error', text: 'Set an RPC endpoint for this network in Settings first. This page refuses to continue without an independent check.' };

  const onDiscover = (): void => {
    setPub(undefined);
    void services.discoverWallets().then(setWallets, () => {
      setWallets([]);
    });
  };

  const onConnect = (w: WalletInfo): void => {
    if (chainId === undefined || !consent || metaAddress === undefined || busyRef.current) return;
    const guard = captureAuthority();
    setPub({ kind: 'ok', text: 'Waiting for your wallet…' });
    connectWallet(w, chainId).then(
      (connected) => {
        try { guard(); } catch { return; }
        setWallet(connected);
        setPub(undefined);
        app.announce('Wallet connected.');
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
        if (expected.to !== reviewed.to || expected.data !== reviewed.data || expected.value !== reviewed.value) throw new Error('The reviewed registry transaction changed. Review it again.');
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
          text: `${reviewAction === 'publish' ? 'Registration' : 'Clear'} submitted: ${hash}. ${check === 'verified' ? 'Your RPC saw the same transaction you reviewed.' : 'Your RPC has not seen it yet; check a block explorer.'}${reviewAction === 'clear' ? ' This removes the current entry only; public chain history remains visible.' : ''}`,
        });
        app.announce(`${reviewAction === 'publish' ? 'Registration' : 'Clear'} submitted.`);
      } catch (e) {
        if (e instanceof WalletBroadcastError) returnedHash = e.hash;
        if (!mounted.current) return;
        if (returnedHash !== undefined) {
          setPub({ kind: 'warn', text: `The wallet returned transaction ${returnedHash}. The session changed or verification failed; check your wallet and the journal before another attempt. This request cannot be cancelled or rolled back by this page.` });
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
      <h2 id="reg-h">Public registry (ERC-6538)</h2>
      <WalletAttempts />
      <p className="hint">
        Canonical registry address <Mono>{ERC6538_REGISTRY_ADDRESS}</Mono>, taken from the text of EIP-6538. The page checks that contract code exists on the
        chosen network and checks its ERC-6538 identity before use. Test networks only until mainnets are enabled.
      </p>
      <Field label="Network">
        {(id) => (
          <select id={id} value={chainId ?? ''} onChange={(e) => { setChainId(Number(e.target.value)); }}>
            {chains.map((c) => <option key={c.chainId} value={c.chainId}>{c.name}</option>)}
          </select>
        )}
      </Field>

      <h3>Publish your meta-address</h3>
      {metaAddress === undefined ? (
        <p>Load or generate keys under Seller keys first.</p>
      ) : (
        <>
          <Notice kind="warn" title="This is a public association with your wallet address">
            Registering writes your meta-address into a public contract, linked permanently to the wallet address that sends the transaction. Anyone can then
            see that this wallet receives GhostPay payments and can look up where to pay it. This cannot be undone; you can only overwrite the entry. If that
            link would harm your privacy, do not publish, and share the meta-address directly instead. Clearing or overwriting replaces the current value but does not erase transaction history.
          </Notice>
          <p>Meta-address to publish: <Mono>{metaAddress}</Mono></p>
          <p>
            <label>
              <input type="checkbox" checked={consent} onChange={(e) => { setConsent(e.target.checked); }} /> I understand this publicly associates my meta-address with my wallet address.
            </label>
          </p>
          {consent && wallet === undefined && (
            <>
              <p><button type="button" className="btn" onClick={onDiscover}>Find wallets</button></p>
              {wallets?.length === 0 && <Notice kind="warn">No browser wallet found.</Notice>}
              {wallets?.map((w) => (
                <button key={w.id} type="button" className="btn" onClick={() => { onConnect(w); }}>Connect {w.name}</button>
              ))}
            </>
          )}
          {wallet !== undefined && <p>Wallet: <Mono>{wallet.account}</Mono> on {chain?.name ?? String(wallet.chainId)}</p>}
          {wallet !== undefined && reviewed === undefined && (
            <div className="actions">
              <button type="button" className="btn" disabled={busy || !consent} onClick={() => { onReview('publish'); }}>Review publish transaction</button>
              <button type="button" className="btn" disabled={busy || !consent} onClick={() => { onReview('clear'); }}>Review clear transaction</button>
            </div>
          )}
          {reviewed !== undefined && chain !== undefined && (
            <>
              <h4>Transaction review</h4>
              <CallPreview call={reviewed} chainName={chain.name} />
              <button type="button" className="btn btn-primary" disabled={busy || !consent} onClick={onPublish}>{reviewAction === 'clear' ? 'Clear registry entry' : 'Publish to registry'}</button>
            </>
          )}
        </>
      )}
      {pub !== undefined && <Notice kind={pub.kind}>{pub.text}</Notice>}

      <section className="panel" aria-label="Public meta-address QR review">
        <h3>Read a public meta-address QR</h3>
        <p className="hint">Scanned text is untrusted. Reading it does not change seller keys or write to the registry. Confirm the owner's identity through another channel.</p>
        <CameraImporter key={chainId} label="Scan or paste a public meta-address" scopeKey={app.session}
          onInputChange={() => { setScannedMeta(undefined); setScanError(undefined); }}
          onText={(text, signal) => {
            if (signal.aborted) return false;
            try { setScannedMeta(parsePublicMetaQr(text)); setScanError(undefined); return true; }
            catch (e) { setScannedMeta(undefined); setScanError(userMessage(e)); return false; }
          }} />
        {scanError !== undefined && <Notice kind="error">{scanError}</Notice>}
        {scannedMeta !== undefined && <><h4>Scanned public meta-address (untrusted)</h4><p><Mono>{scannedMeta}</Mono></p><CopyButton text={scannedMeta} label="Copy scanned public meta-address" /></>}
      </section>

      <h3>Look up a payee</h3>
      <Field label="Wallet address (ENS names are not supported yet)">
        {(id) => <input id={id} type="text" autoComplete="off" spellCheck={false} value={who} onChange={(e) => { setWho(e.target.value); }} />}
      </Field>
      <button type="button" className="btn" disabled={busy || who.trim() === ''} onClick={onLookup}>Look up</button>
      {look !== undefined && <Notice kind={look.kind}>{look.text}</Notice>}
      {found !== undefined && chain !== undefined && (
        <>
          <h4>Read-only call (nothing is sent from your wallet)</h4>
          <CallPreview call={found.call} chainName={chain.name} />
          {found.meta === undefined ? (
            <Notice kind="info">No meta-address is registered for this address on {chain.name}.</Notice>
          ) : (
            <>
              <Notice kind="info" title="Registered by the owner of that address">
                Only the wallet itself (or a signature from it) can set this entry, but you should still confirm the address with the payee out of band before sending funds.
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
