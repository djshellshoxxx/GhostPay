import { findChain, findToken, type Address } from '@ghostpay/chain-adapters';
import { useEffect, useState, type ReactNode } from 'react';
import { CopyButton, Field, Mono, Notice } from '../components/Common';
import { useDeploymentCheck, useManifest } from '../components/Disclosure';
import { deploymentProblem } from '../lib/deployment';
import { UserFacingError, userMessage } from '../lib/errors';
import { formatUnits } from '../lib/format';
import {
  checkDestination,
  destinationWarnings,
  executeDirectSweep,
  getSweepQuote,
  inspectDestination,
  planDirectSweep,
  readBalance,
  relayedSweep,
  type DestinationInfo,
  type DirectSweepPlan,
  type SweepQuoteView,
  type SweepTarget,
} from '../lib/sweep';
import { useServices } from '../lib/services';
import { useApp } from '../state';

export function Sweep(): ReactNode {
  const app = useApp();
  const services = useServices();
  const sel = app.sweepTarget;
  const chainId = sel?.chainId;
  const manifest = useManifest(chainId);
  const { check } = useDeploymentCheck(manifest);
  const [destination, setDestination] = useState('');
  const [mode, setMode] = useState<'relayer' | 'direct'>('relayer');
  const [balance, setBalance] = useState<bigint | undefined>(undefined);
  const [quote, setQuote] = useState<SweepQuoteView | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [hash, setHash] = useState<string | undefined>(undefined);
  const [destInfo, setDestInfo] = useState<DestinationInfo | undefined>(undefined);
  const [ack, setAck] = useState(false);
  const [plan, setPlan] = useState<DirectSweepPlan | undefined>(undefined);

  const meta = sel?.match.metadata;
  const tokenAddr: Address | 'native' | undefined = meta === undefined ? undefined : meta.kind === 'native' ? 'native' : meta.token;
  const tokenCfg = chainId === undefined || tokenAddr === undefined || tokenAddr === 'native' ? undefined : findToken(chainId, tokenAddr);
  const decimals = tokenAddr === 'native' ? 18 : (tokenCfg?.decimals ?? 18);
  const symbol = tokenAddr === 'native' ? (chainId === undefined ? '' : (findChain(chainId)?.nativeSymbol ?? '')) : (tokenCfg?.symbol ?? 'token');

  useEffect(() => {
    let live = true;
    if (chainId === undefined || sel === undefined || tokenAddr === undefined) return;
    void (async () => {
      try {
        const rpc = await app.getRpc(chainId);
        if (rpc === undefined) return;
        const b = await readBalance(rpc, sel.match.stealthAddress, tokenAddr);
        if (live) setBalance(b);
      } catch (e) {
        if (live) setError(userMessage(e));
      }
    })();
    return () => {
      live = false;
    };
  }, [app, chainId, sel, tokenAddr]);

  if (sel === undefined || chainId === undefined || tokenAddr === undefined) {
    return (
      <section aria-labelledby="sw-h">
        <h2 id="sw-h">Sweep</h2>
        <Notice kind="info">Choose a payment to sweep from Scan and receive.</Notice>
        <button type="button" className="btn btn-primary" onClick={() => { app.setView('scan'); }}>Go to Scan and receive</button>
      </section>
    );
  }
  if (app.session === undefined) {
    return (
      <section aria-labelledby="sw-h">
        <h2 id="sw-h">Sweep</h2>
        <Notice kind="info">Your keys are no longer in memory. Load them again in Seller keys.</Notice>
      </section>
    );
  }

  const target: SweepTarget = { chainId, token: tokenAddr, owner: sel.match.stealthAddress, announcement: sel.match.announcement };
  // Addresses used for the sweep are the ones READ FROM THE CHAIN, and nothing is enabled until they were.
  const verified = check !== undefined && check !== 'checking' && check.status === 'verified' ? check.verified : undefined;
  const loaded = manifest?.status === 'loaded' && verified !== undefined ? { ...manifest.manifest, router: verified.router, sweepRelayer: verified.sweepRelayer, announcer: verified.announcer, feeRecipient: verified.feeRecipient } : undefined;
  const deployProblem = manifest?.status === 'loaded' ? deploymentProblem(check) : undefined;
  const destReady = destInfo !== undefined && (!destInfo.hasHistory || ack);
  const hosts = app.rpcHosts(chainId);
  const relayerOk = tokenCfg?.permit === true && app.settings.relayerUrl !== '';
  const nowSec = (): number => Math.floor(services.nowMs() / 1000);

  const guard = async (fn: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setError(undefined);
    try {
      await fn();
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const resetDest = (): void => {
    setDestInfo(undefined);
    setAck(false);
    setPlan(undefined);
    setQuote(undefined);
  };

  const onInspect = (): void => {
    void guard(async () => {
      const rpc = await app.getRpc(chainId);
      if (loaded === undefined || rpc === undefined) throw new UserFacingError('Configure an RPC for this chain in Settings so the destination can be checked.');
      const dest = checkDestination(destination, target.owner, loaded);
      setAck(false);
      setDestInfo(await inspectDestination(rpc, dest));
    });
  };

  const onQuote = (): void => {
    void guard(async () => {
      if (loaded === undefined || balance === undefined || tokenAddr === 'native') throw new Error('state');
      const dest = checkDestination(destination, target.owner, loaded);
      setQuote(await getSweepQuote(app.settings.relayerUrl, { ...target, token: tokenAddr }, dest, balance, nowSec(), services.fetchFn));
    });
  };

  const onRelay = (): void => {
    void guard(async () => {
      const rpc = await app.getRpc(chainId);
      if (loaded === undefined || rpc === undefined || quote === undefined || balance === undefined || tokenAddr === 'native') throw new Error('state');
      const dest = checkDestination(destination, target.owner, loaded);
      setHash(await relayedSweep({ target: { ...target, token: tokenAddr }, manifest: loaded, destination: dest, amount: balance, quote: quote.quote, relayerUrl: app.settings.relayerUrl, rpc, nowSeconds: nowSec(), fetchFn: services.fetchFn }));
      app.announce('Sweep submitted to the relayer.');
    });
  };

  const onDirect = (): void => {
    void guard(async () => {
      const rpc = await app.getRpc(chainId);
      if (loaded === undefined || rpc === undefined || balance === undefined) throw new Error('state');
      const dest = checkDestination(destination, target.owner, loaded);
      const input = { target, destination: dest, amount: balance, rpc };
      if (plan === undefined) {
        setPlan(await planDirectSweep(input));
        return;
      }
      const res = await executeDirectSweep(input, plan);
      setHash(res.hash);
      setPlan(undefined);
      app.announce('Sweep broadcast.');
    });
  };

  return (
    <section aria-labelledby="sw-h">
      <h2 id="sw-h">Sweep</h2>
      <dl className="details">
        <dt>Chain</dt>
        <dd>{findChain(chainId)?.name ?? String(chainId)}</dd>
        <dt>One-time address</dt>
        <dd><Mono>{target.owner}</Mono></dd>
        <dt>Asset</dt>
        <dd>{symbol} {tokenAddr === 'native' ? '' : <Mono>{tokenAddr}</Mono>}</dd>
        <dt>Balance on chain</dt>
        <dd>{balance === undefined ? 'unknown (an RPC for this chain is required)' : `${formatUnits(balance, decimals)} ${symbol}`}</dd>
      </dl>
      {manifest !== undefined && manifest.status !== 'loaded' && <Notice kind="warn">Payments disabled on this chain: no usable deployment manifest is bundled.</Notice>}
      {deployProblem !== undefined && <Notice kind={check === undefined || check === 'checking' ? 'info' : 'warn'}>{deployProblem}</Notice>}
      {tokenAddr !== 'native' && tokenCfg === undefined && <Notice kind="error">This token is not on the allowlist. It will not be swept from here.</Notice>}
      <Notice kind="warn" title="The payer can follow this sweep">
        The person who paid you knows the one-time address above, and anyone can watch it on a block explorer. When you move the funds, that person (and every observer) sees the destination you chose and can look at everything else that address has received or will receive: your other customers&rsquo; payments, your balance, your exchange deposits. A relayer does not change this; it only adds that the relayer operator sees your IP address (hashed), the amount and the timing. Use a fresh destination address for every sweep (for example a new address from your wallet), do not reuse one, and do not sweep to an address that is publicly known to be yours. Stealth addresses hide you only until the first sweep; unlinking afterwards needs a separate privacy mechanism that this app does not provide.
      </Notice>
      <Notice kind="warn" title="Your RPC provider sees this">
        {hosts.length === 0 ? 'The RPC provider you configure' : `Your RPC provider (${hosts.join(', ')})`} learns your IP address and that you are interested in this one-time address and the destination below: balance and nonce reads, the destination check and the transaction itself all go through it. Use your own node or a Tor-capable path if you do not want that link.
      </Notice>
      <Notice kind="info" title="Your key stays in this page">
        Your stealth key is derived in memory for this action and is never shown or stored.
      </Notice>

      <div className="stack">
        <Field label="Destination address (your own wallet)">{(id) => <input id={id} spellCheck={false} value={destination} onChange={(e) => { setDestination(e.target.value); resetDest(); }} placeholder="0x…" />}</Field>
        <div className="actions">
          <button type="button" className="btn" onClick={onInspect} disabled={busy || loaded === undefined}>Check destination history</button>
        </div>
        {destInfo !== undefined && !destInfo.hasHistory && <Notice kind="ok" title="Fresh destination">Your RPC shows no transactions, no balance and no code at this address. Keep using fresh addresses.</Notice>}
        {destInfo?.hasHistory === true && (
          <Notice kind="warn" title="This destination is not fresh">
            <ul className="warn-list">
              {destinationWarnings(destInfo).map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
            <p>Sweeping here links this payment to everything that address has done, and the payer can see it. Choose a fresh address unless you accept that.</p>
            <div className="check">
              <input id="ack-hist" type="checkbox" checked={ack} onChange={(e) => { setAck(e.target.checked); }} />
              <label htmlFor="ack-hist">I understand the payer can follow the funds to this address, and I want to sweep here anyway.</label>
            </div>
          </Notice>
        )}
        <fieldset>
          <legend>How to pay the network fee</legend>
          <div className="check">
            <input id="m-relay" type="radio" name="mode" checked={mode === 'relayer'} onChange={() => { setMode('relayer'); }} />
            <label htmlFor="m-relay">Through the relayer (fee deducted from the amount; needs a permit-capable token)</label>
          </div>
          <div className="check">
            <input id="m-direct" type="radio" name="mode" checked={mode === 'direct'} onChange={() => { setMode('direct'); }} />
            <label htmlFor="m-direct">Directly (the one-time address must hold native coin for gas)</label>
          </div>
        </fieldset>

        {mode === 'relayer' ? (
          <>
            {!relayerOk && <Notice kind="info">Relayer sweeps need a relayer URL in Settings and a token with ERC-2612 permit. Use a direct sweep otherwise.</Notice>}
            <button type="button" className="btn" onClick={onQuote} disabled={busy || !relayerOk || !destReady || loaded === undefined || balance === undefined || balance === 0n}>Get relayer quote</button>
            {quote !== undefined && (
              <div className="panel">
                <p>Relayer fee: {formatUnits(quote.quote.fee, decimals)} {symbol}, to <Mono>{quote.quote.feeTo}</Mono></p>
                <p>You receive: {formatUnits(quote.net, decimals)} {symbol}</p>
                <button type="button" className="btn btn-primary" onClick={onRelay} disabled={busy || !destReady}>Sign and submit to relayer</button>
              </div>
            )}
          </>
        ) : (
          <>
            {plan !== undefined && (
              <div className="panel">
                <h3>Confirm the network fee</h3>
                <dl className="details">
                  <dt>Amount sent to the destination</dt>
                  <dd>{formatUnits(plan.sent, decimals)} {symbol}</dd>
                  <dt>Gas limit</dt>
                  <dd>{plan.gas.toString()}</dd>
                  <dt>Max fee per gas</dt>
                  <dd>{plan.maxFeePerGas.toString()} wei (taken from your RPC, capped)</dd>
                  <dt>Worst-case network fee, paid from the one-time address</dt>
                  <dd>{formatUnits(plan.maxGasCost, 18)} {findChain(chainId)?.nativeSymbol ?? ''}</dd>
                  <dt>Calls contract</dt>
                  <dd><Mono>{plan.to}</Mono>{plan.token === 'native' ? ' (the destination)' : ' (allowlisted token)'}</dd>
                </dl>
              </div>
            )}
            <button
              type="button"
              className="btn btn-primary"
              onClick={onDirect}
              disabled={busy || !destReady || loaded === undefined || balance === undefined || balance === 0n || (tokenAddr !== 'native' && tokenCfg === undefined)}
            >
              {plan === undefined ? 'Prepare direct sweep' : 'Sign and broadcast directly'}
            </button>
          </>
        )}
      </div>

      {busy && <p role="status">Working…</p>}
      {error !== undefined && <Notice kind="error">{error}</Notice>}
      {hash !== undefined && (
        <Notice kind="ok" title="Submitted">
          Transaction hash: <Mono>{hash}</Mono> <CopyButton text={hash} label="Copy hash" />
          <br />
          Check it on your RPC or a block explorer you trust before relying on it.
        </Notice>
      )}
    </section>
  );
}
