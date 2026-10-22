import { buildLookupCall, buildRegisterKeysCall, ERC6538_REGISTRY_ADDRESS, lookupMetaAddress, verifyRegistry, type RegistryCall } from '@ghostpay/chain-adapters';
import { useEffect, useState, type ReactNode } from 'react';
import { CopyButton, Field, Mono, Notice } from '../../components/Common';
import { userMessage } from '../../lib/errors';
import { useServices } from '../../lib/services';
import { connectWallet, sendViaWallet, verifySubmission, type WalletInfo, type WalletSession } from '../../lib/wallet';
import { useApp } from '../../state';
import { buildClearRegistryCall } from '../../lib/registry';

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

  // Any change to chain, consent or keys invalidates a prepared review and the wallet connection.
  const metaAddress = app.session?.metaAddress;
  useEffect(() => {
    setReviewed(undefined);
    setReviewAction(undefined);
    setWallet(undefined);
  }, [chainId, consent, metaAddress]);

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
    if (chainId === undefined) return;
    setPub({ kind: 'ok', text: 'Waiting for your wallet…' });
    connectWallet(w, chainId).then(
      (s) => {
        setWallet(s);
        setPub(undefined);
        app.announce('Wallet connected.');
      },
      (e: unknown) => {
        setPub({ kind: 'error', text: userMessage(e) });
      },
    );
  };

  const onReview = (action: 'publish' | 'clear'): void => {
    if (metaAddress === undefined) return;
    setBusy(true);
    void (async () => {
      try {
        const rpc = await rpcFor();
        await verifyRegistry(rpc);
        setReviewed(action === 'publish' ? buildRegisterKeysCall(metaAddress) : buildClearRegistryCall());
        setReviewAction(action);
        setPub(undefined);
      } catch (e) {
        setPub(rpcMissing(e) ? noRpc : { kind: 'error', text: userMessage(e) });
      } finally {
        setBusy(false);
      }
    })();
  };

  const onPublish = (): void => {
    if (wallet === undefined || reviewed === undefined || reviewAction === undefined || chainId === undefined || metaAddress === undefined) return;
    setBusy(true);
    void (async () => {
      try {
        const rpc = await rpcFor();
        await verifyRegistry(rpc);
        const expected = reviewAction === 'publish' ? buildRegisterKeysCall(metaAddress) : buildClearRegistryCall();
        if (expected.to !== reviewed.to || expected.data !== reviewed.data || expected.value !== reviewed.value) throw new Error('The reviewed registry transaction changed. Review it again.');
        const hash = await sendViaWallet(wallet, expected);
        const check = await verifySubmission(rpc, hash, { from: wallet.account, to: expected.to, data: expected.data, value: 0n, chainId }, services.sleep);
        setReviewed(undefined);
        setReviewAction(undefined);
        setPub({
          kind: check === 'verified' ? 'ok' : 'warn',
          text: `${reviewAction === 'publish' ? 'Registration' : 'Clear'} submitted: ${hash}. ${check === 'verified' ? 'Your RPC saw the same transaction you reviewed.' : 'Your RPC has not seen it yet; check a block explorer.'}${reviewAction === 'clear' ? ' This removes the current entry only; public chain history remains visible.' : ''}`,
        });
        app.announce(`${reviewAction === 'publish' ? 'Registration' : 'Clear'} submitted.`);
      } catch (e) {
        setPub(rpcMissing(e) ? noRpc : { kind: 'error', text: userMessage(e) });
      } finally {
        setBusy(false);
      }
    })();
  };

  const onLookup = (): void => {
    setFound(undefined);
    setLook(undefined);
    setBusy(true);
    void (async () => {
      try {
        const call = buildLookupCall(who.trim());
        const rpc = await rpcFor();
        await verifyRegistry(rpc);
        const meta = await lookupMetaAddress(rpc, who.trim());
        setFound({ meta, call });
      } catch (e) {
        setLook(rpcMissing(e) ? noRpc : { kind: 'error', text: userMessage(e) });
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <section aria-labelledby="reg-h">
      <h2 id="reg-h">Public registry (ERC-6538)</h2>
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
