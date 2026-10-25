import type { ChainConfig } from '@ghostpay/chain-adapters';
import type { PolicyRecord } from '@ghostpay/policy-scheme';
import { useState, type ReactNode } from 'react';
import { Field, Mono, Notice } from '../../components/Common';
import { userMessage } from '../../lib/errors';
import { useServices } from '../../lib/services';
import { connectWallet, type WalletInfo, type WalletSession } from '../../lib/wallet';
import { useApp } from '../../state';
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
}

function WalletPicker(props: { readonly chainId: number; readonly onConnected: (w: WalletSession) => void }): ReactNode {
  const services = useServices();
  const [wallets, setWallets] = useState<readonly WalletInfo[] | undefined>(undefined);
  const [err, setErr] = useState<string | undefined>(undefined);
  return (
    <div>
      <button type="button" onClick={() => { setErr(undefined); void services.discoverWallets().then(setWallets, (e: unknown) => { setErr(userMessage(e)); }); }}>
        Find wallets
      </button>
      {wallets?.length === 0 && <p>No browser wallet found.</p>}
      <ul className="plain">
        {wallets?.map((w) => (
          <li key={w.id}>
            <button type="button" onClick={() => { setErr(undefined); connectWallet(w, props.chainId).then(props.onConnected, (e: unknown) => { setErr(userMessage(e)); }); }}>
              Connect {w.name}
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
  const testnets = services.chains.filter((c) => c.testnet);
  const [chainId, setChainId] = useState<number | undefined>(testnets[0]?.chainId);
  const chain = testnets.find((c) => c.chainId === chainId);
  const [factory, setFactory] = useState('');
  const [router, setRouter] = useState('');
  const [deployment, setDeployment] = useState<PolicyChainDeployment | undefined>(undefined);
  const [depErr, setDepErr] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [wallet, setWallet] = useState<WalletSession | undefined>(undefined);
  const [records, setRecords] = useState<readonly PolicyRecord[]>([]);

  const verify = async (): Promise<void> => {
    if (chain === undefined) return;
    setBusy(true);
    setDepErr(undefined);
    setDeployment(undefined);
    try {
      const client = await app.getRpc(chain.chainId);
      if (client === undefined) throw new Error('no-rpc');
      setDeployment(await verifyPolicyDeployment(client, chain, { factory, router }));
    } catch (e) {
      setDepErr(e instanceof Error && e.message === 'no-rpc' ? 'Configure an RPC for this network in Settings first.' : userMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const ctx: PolicyCtx | undefined = chain === undefined ? undefined : {
    chain,
    deployment,
    wallet: wallet?.chainId === chain.chainId ? wallet : undefined,
    records,
    addRecord: (r) => { setRecords((prev) => (prev.some((x) => x.policyHash === r.policyHash) ? prev : [...prev, r])); },
  };

  return (
    <section aria-labelledby="policy-title">
      <h2 id="policy-title">Policy accounts (experimental)</h2>
      <Notice kind="warn" title="Experimental and unaudited">{POLICY_WARNING}</Notice>
      <p>
        A policy meta-address (scheme 0x47500002) makes every payment land in a small contract account that can only pay out to your
        chosen destination, after a delay and within per-token limits. A stolen key is delayed, not stopped: watch the account and
        cancel what you did not sign.
      </p>

      <h3>Network and contracts</h3>
      {testnets.length === 0 ? <Notice kind="info">No test network is configured.</Notice> : (
        <>
          <Field label="Test network">
            {(id) => (
              <select id={id} value={chainId} onChange={(e) => { setChainId(Number(e.target.value)); setDeployment(undefined); }}>
                {testnets.map((c) => <option key={c.chainId} value={c.chainId}>{c.name}</option>)}
              </select>
            )}
          </Field>
          <Notice kind="info">
            No policy deployment is pinned for any network. Enter a factory and router you deployed yourself; the app reads the
            implementation, fee recipient and announcer back from the chain.
          </Notice>
          <Field label="PolicyAccountFactory address">{(id) => <input id={id} value={factory} onChange={(e) => { setFactory(e.target.value); }} spellCheck={false} />}</Field>
          <Field label="GhostPayPolicyRouter address">{(id) => <input id={id} value={router} onChange={(e) => { setRouter(e.target.value); }} spellCheck={false} />}</Field>
          <button type="button" disabled={busy} onClick={() => { void verify(); }}>Verify on-chain</button>
          {depErr !== undefined && <Notice kind="error">{depErr}</Notice>}
          {deployment !== undefined && (
            <dl className="kv" aria-label="Verified policy deployment">
              <dt>Factory</dt><dd><Mono>{deployment.factory}</Mono></dd>
              <dt>Implementation</dt><dd><Mono>{deployment.implementation}</Mono></dd>
              <dt>Router</dt><dd><Mono>{deployment.router}</Mono></dd>
              <dt>Router fee recipient</dt><dd><Mono>{deployment.feeRecipient}</Mono></dd>
              <dt>Announcer</dt><dd><Mono>{deployment.announcer}</Mono></dd>
            </dl>
          )}
          <h3>Wallet</h3>
          {ctx?.wallet !== undefined ? <p>Connected: <Mono>{ctx.wallet.account}</Mono></p> : chain !== undefined && <WalletPicker chainId={chain.chainId} onConnected={setWallet} />}
        </>
      )}

      {ctx !== undefined && (
        <>
          <PolicyCreate ctx={ctx} />
          <PolicyPay ctx={ctx} />
          <PolicyReceive ctx={ctx} />
        </>
      )}
    </section>
  );
}
