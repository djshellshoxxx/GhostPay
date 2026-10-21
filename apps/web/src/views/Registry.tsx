import {
  REGISTRY_ADDRESS,
  assertRegistryAvailable,
  buildClearKeys,
  buildRegisterKeys,
  lookupMeta,
  type Hex,
} from '@ghostpay/chain-adapters';
import { useEffect, useState, type ReactNode } from 'react';
import { Field, Mono, Notice } from '../components/Common';
import { UserFacingError, userMessage } from '../lib/errors';
import { useServices } from '../lib/services';
import { connectWallet, sendViaWallet, type TxRequest, type WalletInfo } from '../lib/wallet';
import { useApp } from '../state';

type Msg = { readonly kind: 'ok' | 'error' | 'info'; readonly text: string };

/**
 * Optional ERC-6538 registry section. Everything here is opt-in and labelled: publishing is a PUBLIC, permanent
 * association between the sending wallet address and the meta-address. Both actions are gated by
 * `assertRegistryAvailable` (fail closed: needs a pinned code hash for the chain).
 */
export function Registry(): ReactNode {
  const app = useApp();
  const services = useServices();
  const [chainId, setChainId] = useState<number>(services.chains[0]?.chainId ?? 84532);
  const [pin, setPin] = useState('');
  const [who, setWho] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<{ readonly registrant: string; readonly meta: string | null } | undefined>(undefined);
  const [msg, setMsg] = useState<Msg | undefined>(undefined);
  const [wallets, setWallets] = useState<readonly WalletInfo[]>([]);
  const [walletId, setWalletId] = useState('');

  useEffect(() => {
    let live = true;
    void services.discoverWallets().then(
      (w) => {
        if (live) {
          setWallets(w);
          setWalletId((cur) => (cur === '' ? (w[0]?.id ?? '') : cur));
        }
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [services]);

  /** RPC for the chain plus the fail-closed registry gate. */
  const gate = async (): Promise<NonNullable<Awaited<ReturnType<typeof app.getRpc>>>> => {
    const rpc = await app.getRpc(chainId);
    if (rpc === undefined) throw new UserFacingError('Configure an RPC for this chain in Settings first.');
    const typed = pin.trim();
    if (typed !== '' && !/^0x[0-9a-fA-F]{64}$/.test(typed)) throw new UserFacingError('The expected code hash must be 0x followed by 64 hexadecimal characters.');
    await assertRegistryAvailable(rpc, typed === '' ? undefined : (typed as Hex));
    return rpc;
  };

  const run = (f: () => Promise<void>): void => {
    setBusy(true);
    setMsg(undefined);
    f().then(
      () => {
        setBusy(false);
      },
      (e: unknown) => {
        setBusy(false);
        setMsg({ kind: 'error', text: userMessage(e) });
      },
    );
  };

  const onLookup = (): void => {
    run(async () => {
      const registrant = who.trim();
      const rpc = await gate();
      const meta = await lookupMeta(rpc, registrant);
      setFound({ registrant, meta });
    });
  };

  const publish = (tx: TxRequest, done: string): void => {
    run(async () => {
      await gate();
      const wallet = wallets.find((w) => w.id === walletId);
      if (wallet === undefined) throw new UserFacingError('No wallet was found. Install or unlock a browser wallet and reopen this section.');
      const session = await connectWallet(wallet, chainId);
      const hash = await sendViaWallet(session, tx);
      setConsent(false);
      setMsg({ kind: 'ok', text: `${done} Transaction ${hash}.` });
      app.announce(done);
    });
  };

  const meta = app.session?.metaAddress;
  const own = found?.meta !== null && found?.meta !== undefined && found.meta === meta;

  return (
    <details className="registry">
      <summary>Public registry (ERC-6538), optional</summary>
      <Notice kind="warn" title="Privacy warning">
        Publishing links your wallet address to your meta-address in a public, permanent on-chain record. Anyone can then see that this wallet receives GhostPay payments and can look up your meta-address from the wallet address. A later overwrite or clear does not remove the history. Nothing is published unless you tick the box and press Publish. Sharing your meta-address directly (or via an invoice) does not need this.
      </Notice>
      <p className="hint">
        Registry: <Mono>{REGISTRY_ADDRESS}</Mono>. The registry is checked against a pinned code hash before any lookup or publish; this release ships no pinned hash, so you must supply one you verified yourself.
      </p>
      <div className="stack">
        <Field label="Registry chain">
          {(id) => (
            <select id={id} value={chainId} onChange={(e) => { setChainId(Number(e.target.value)); setFound(undefined); }} disabled={busy}>
              {services.chains.map((c) => (
                <option key={c.chainId} value={c.chainId}>{c.name}</option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Expected registry code hash" hint="keccak256 of the registry's runtime code on this chain, taken from a source you trust. Without it the registry is treated as unavailable.">
          {(id, d) => <input id={id} aria-describedby={d} spellCheck={false} value={pin} onChange={(e) => { setPin(e.target.value); }} disabled={busy} />}
        </Field>
      </div>

      <h4>Look up a wallet</h4>
      <p className="hint">Anyone can write an entry for their own address only, but an entry is just a claim. Confirm it with its owner before paying. Your RPC provider sees which address you look up.</p>
      <div className="stack">
        <Field label="Wallet address to look up">
          {(id) => <input id={id} spellCheck={false} value={who} onChange={(e) => { setWho(e.target.value); }} disabled={busy} />}
        </Field>
        <div className="actions">
          <button type="button" className="btn" onClick={onLookup} disabled={busy}>Look up</button>
        </div>
      </div>
      {found !== undefined && (
        <Notice kind="info" title="Lookup result">
          {found.meta === null ? (
            <>No valid scheme-1 meta-address is published for <Mono>{found.registrant}</Mono>.</>
          ) : (
            <>
              <Mono>{found.registrant}</Mono> published <Mono>{found.meta}</Mono>.{own ? ' This is your own meta-address.' : ' This is unverified third-party data.'}
            </>
          )}
        </Notice>
      )}

      <h4>Publish or clear your entry</h4>
      {meta === undefined ? (
        <p className="hint">Load or generate keys above to publish a meta-address.</p>
      ) : (
        <div className="stack">
          <p>The meta-address shown at the top of this page is the one that would be published.</p>
          {wallets.length > 1 && (
            <Field label="Wallet">
              {(id) => (
                <select id={id} value={walletId} onChange={(e) => { setWalletId(e.target.value); }} disabled={busy}>
                  {wallets.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              )}
            </Field>
          )}
          <div className="check">
            <input id="registry-consent" type="checkbox" checked={consent} onChange={(e) => { setConsent(e.target.checked); }} disabled={busy} />
            <label htmlFor="registry-consent">I understand this publicly and permanently links the connected wallet address to this meta-address.</label>
          </div>
          <div className="actions">
            <button type="button" className="btn btn-primary" disabled={busy || !consent} onClick={() => { publish(buildRegisterKeys(meta), 'Meta-address published.'); }}>
              Publish my meta-address
            </button>
            <button type="button" className="btn" disabled={busy || !consent} onClick={() => { publish(buildClearKeys(), 'Registry entry cleared.'); }}>
              Clear my entry
            </button>
          </div>
        </div>
      )}
      {msg !== undefined && <Notice kind={msg.kind}>{msg.text}</Notice>}
    </details>
  );
}
