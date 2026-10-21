import { assertRegisterKeysTx, buildRegisterKeysTx, ERC6538_REGISTRY, findChain, lookupMetaAddress, verifyRegistry, type RpcClient } from '@ghostpay/chain-adapters';
import { useState, type ReactNode } from 'react';
import { getAddress, isAddress } from 'viem/utils';
import { userMessage } from '../lib/errors';
import { submitTx } from '../lib/payExec';
import { useServices } from '../lib/services';
import { connectWallet, type WalletInfo } from '../lib/wallet';
import { useApp } from '../state';
import { Field, Mono, Notice } from './Common';

/**
 * ERC-6538 registry (G-07): optional PUBLIC publication of the meta-address, and lookup by wallet address.
 * Publishing is a transaction from the wallet you choose; it permanently associates that wallet address with this
 * meta-address for everyone, which defeats the purpose of keeping the seller unlinked from their wallet.
 */
export function RegistryPanel(): ReactNode {
  const app = useApp();
  const services = useServices();
  const [chainId, setChainId] = useState<number>(services.chains[0]?.chainId ?? 84532);
  const [confirm, setConfirm] = useState(false);
  const [wallets, setWallets] = useState<readonly WalletInfo[] | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error' | 'info'; text: string } | undefined>(undefined);
  const [who, setWho] = useState('');
  const [found, setFound] = useState<string | undefined>(undefined);
  const s = app.session;

  const rpcFor = async (): Promise<RpcClient> => {
    const rpc = await app.getRpc(chainId);
    if (rpc === undefined) throw new Error('rpc');
    await verifyRegistry(rpc);
    return rpc;
  };
  const fail = (e: unknown): void => {
    setMsg({ kind: 'error', text: e instanceof Error && e.message === 'rpc' ? 'Configure an RPC for this chain in Settings first: the registry must be checked on-chain before it is used.' : userMessage(e) });
  };

  const findWallets = (): void => {
    void services.discoverWallets().then(setWallets, () => {
      setWallets([]);
    });
  };

  const publish = (w: WalletInfo): void => {
    if (s === undefined) return;
    setBusy(true);
    setMsg(undefined);
    void (async () => {
      try {
        const rpc = await rpcFor();
        const session = await connectWallet(w, chainId);
        const tx = buildRegisterKeysTx(s.metaAddress);
        assertRegisterKeysTx(tx, s.metaAddress);
        const res = await submitTx(session, tx, { rpc, nowSeconds: () => Math.floor(services.nowMs() / 1000), sleep: services.sleep }, setStatus);
        setMsg({
          kind: res.receipt?.status === 'success' ? 'ok' : 'info',
          text:
            res.receipt?.status === 'success'
              ? `Published. ${session.account} is now publicly linked to this meta-address on ${findChain(chainId)?.name ?? 'this chain'}. Transaction ${res.hash}.`
              : `Submitted (${res.hash}) but not confirmed as successful yet. Check it in your wallet.`,
        });
      } catch (e) {
        fail(e);
      } finally {
        setStatus('');
        setBusy(false);
      }
    })();
  };

  const lookup = (): void => {
    setBusy(true);
    setMsg(undefined);
    setFound(undefined);
    void (async () => {
      try {
        if (!isAddress(who.trim(), { strict: false })) throw new Error('addr');
        const rpc = await rpcFor();
        const m = await lookupMetaAddress(rpc, getAddress(who.trim()));
        setFound(m ?? '');
      } catch (e) {
        if (e instanceof Error && e.message === 'addr') setMsg({ kind: 'error', text: 'Enter a valid wallet address (0x…).' });
        else fail(e);
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <div>
      <h3>Public registry (ERC-6538, optional)</h3>
      <p className="hint">
        The canonical registry at <Mono>{ERC6538_REGISTRY}</Mono> lets people look up a meta-address by wallet address. The app checks on-chain that the registry exists and answers as expected before it is used.
      </p>
      <Field label="Chain">
        {(id) => (
          <select id={id} value={chainId} onChange={(e) => { setChainId(Number(e.target.value)); }} disabled={busy}>
            {services.chains.map((c) => (
              <option key={c.chainId} value={c.chainId}>{c.name}</option>
            ))}
          </select>
        )}
      </Field>
      {s !== undefined && (
        <>
          <Notice kind="warn" title="This is public and permanent">
            Publishing associates the wallet address you sign with, in public, with this seller meta-address. Anyone can then connect that wallet to every invoice you issue and to the payments you receive, and a blockchain entry cannot be erased (you can only overwrite it with another entry). Do not publish from a wallet that identifies you if you want to stay unlinked. Only do this if you want payers to find you by address.
          </Notice>
          <div className="check">
            <input id="reg-ack" type="checkbox" checked={confirm} onChange={(e) => { setConfirm(e.target.checked); }} />
            <label htmlFor="reg-ack">I understand this publicly links my wallet address to this meta-address.</label>
          </div>
          <div className="actions">
            <button type="button" className="btn" onClick={findWallets} disabled={busy || !confirm}>Choose a wallet to publish from</button>
          </div>
          {wallets?.length === 0 && <Notice kind="warn">No browser wallet found.</Notice>}
          <ul className="plain-list">
            {wallets?.map((w) => (
              <li key={w.id}>
                <button type="button" className="btn btn-primary" onClick={() => { publish(w); }} disabled={busy || !confirm}>
                  Publish meta-address with {w.name}{w.rdns !== undefined ? ` (${w.rdns})` : ''}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <h4>Look up a wallet address</h4>
      <div className="row">
        <Field label="Wallet address" hint="An entry is self-published: it proves nothing about who owns the wallet.">
          {(id, d) => <input id={id} aria-describedby={d} spellCheck={false} value={who} onChange={(e) => { setWho(e.target.value); }} placeholder="0x…" />}
        </Field>
        <button type="button" className="btn" onClick={lookup} disabled={busy}>Look up</button>
      </div>
      {found !== undefined && (found === '' ? <p>No scheme-1 meta-address is registered for that address.</p> : <p>Registered: <Mono>{found}</Mono></p>)}
      {status !== '' && <p role="status">{status}</p>}
      {msg !== undefined && <Notice kind={msg.kind}>{msg.text}</Notice>}
    </div>
  );
}
