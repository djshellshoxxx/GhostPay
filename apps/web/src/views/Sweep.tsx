import { findChain, findToken, type Address } from '@ghostpay/chain-adapters';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CopyButton, Field, Mono, Notice } from '../components/Common';
import { CameraImporter } from '../components/CameraImporter';
import { useManifest } from '../components/Disclosure';
import { ManifestBanner } from '../components/ManifestBanner';
import { verifyManifestForFlow } from '../lib/manifest';
import { UserFacingError, userMessage } from '../lib/errors';
import { formatUnits } from '../lib/format';
import { checkDestination, directSweep, getSweepQuote, readBalance, relayedSweep, type SweepQuoteView, type SweepTarget } from '../lib/sweep';
import { authorizeEncryptedVault, readEncryptedVault } from '../lib/keyVault';
import { captureSessionGuard } from '../lib/session';
import { useServices } from '../lib/services';
import { useApp } from '../state';

export function Sweep(): ReactNode {
  const app = useApp();
  const services = useServices();
  const sel = app.sweepTarget;
  const chainId = sel?.chainId;
  const manifest = useManifest(chainId);
  const [destination, setDestination] = useState('');
  const [mode, setMode] = useState<'relayer' | 'direct'>('relayer');
  const [balance, setBalance] = useState<bigint | undefined>(undefined);
  const [quote, setQuote] = useState<SweepQuoteView | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [hash, setHash] = useState<string | undefined>(undefined);
  const [vaultState, setVaultState] = useState<'checking' | 'empty' | 'saved' | 'error'>('checking');
  const [vaultPass, setVaultPass] = useState('');
  const [vaultPhase, setVaultPhase] = useState<'idle' | 'authorizing' | 'action'>('idle');
  const operation = useRef(0);
  const authEpoch = useRef(0);

  useEffect(() => {
    let live = true;
    void readEncryptedVault().then(
      (saved) => { if (live) setVaultState(saved === undefined ? 'empty' : 'saved'); },
      () => { if (live) setVaultState('error'); },
    );
    return () => { live = false; };
  }, []);

  useEffect(() => {
    setVaultPass('');
    authEpoch.current += 1;
    return () => { authEpoch.current += 1; };
  }, [app.session]);

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
  const loaded = manifest?.status === 'loaded' ? manifest.manifest : undefined;
  const relayerOk = tokenCfg?.permit === true && app.settings.relayerUrl !== '';
  const nowSec = (): number => Math.floor(services.nowMs() / 1000);

  const guard = async (fn: (assertCurrent: () => void) => Promise<boolean | void>): Promise<void> => {
    const id = ++operation.current;
    const epoch = authEpoch.current;
    const liveSession = captureSessionGuard();
    const assertCurrent = (): void => {
      if (authEpoch.current !== epoch) throw new UserFacingError('Vault check cancelled because seller keys changed.');
      liveSession();
    };
    setBusy(true);
    setVaultPhase('authorizing');
    setError(undefined);
    try {
      const vaultGuard = await authorizeEncryptedVault(vaultPass);
      assertCurrent();
      vaultGuard?.();
      setVaultPhase('action');
      const assertAuthorized = (): void => { assertCurrent(); vaultGuard?.(); };
      const broadcast = await fn(assertAuthorized);
      // Once the transport accepts a transaction/order, a session lock cannot make it unsent.
      if (broadcast !== true) assertAuthorized();
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setVaultPass('');
      if (operation.current === id) {
        setBusy(false);
        setVaultPhase('idle');
      }
    }
  };

  /** WEB-APP-01: read the manifest back from the chain before anything is signed or requested from it. */
  const verified = async (rpc: Awaited<ReturnType<typeof app.getRpc>>): Promise<void> => {
    if (manifest === undefined) throw new Error('state');
    const checked = await verifyManifestForFlow(manifest, rpc);
    if (checked.status !== 'loaded') throw new UserFacingError(checked.status === 'invalid' ? checked.reason : 'Payments are disabled on this chain: no deployment manifest is loaded.');
  };

  const onQuote = (): void => {
    void guard(async (assertCurrent) => {
      const rpc = await app.getRpc(chainId);
      assertCurrent();
      await verified(rpc);
      assertCurrent();
      if (loaded === undefined || balance === undefined || tokenAddr === 'native') throw new Error('state');
      const dest = checkDestination(destination, target.owner, loaded);
      const nextQuote = await getSweepQuote(app.settings.relayerUrl, { ...target, token: tokenAddr }, dest, balance, nowSec(), loaded.feeRecipient, services.fetchFn);
      assertCurrent();
      setQuote(nextQuote);
    });
  };

  const onRelay = (): void => {
    void guard(async (assertCurrent) => {
      const rpc = await app.getRpc(chainId);
      assertCurrent();
      await verified(rpc);
      assertCurrent();
      if (loaded === undefined || rpc === undefined || quote === undefined || balance === undefined || tokenAddr === 'native') throw new Error('state');
      const dest = checkDestination(destination, target.owner, loaded);
      const submitted = await relayedSweep({ target: { ...target, token: tokenAddr }, manifest: loaded, destination: dest, amount: balance, quote: quote.quote, relayerUrl: app.settings.relayerUrl, rpc, nowSeconds: nowSec, fetchFn: services.fetchFn });
      setHash(submitted);
      app.announce('Sweep submitted to the relayer.');
      return true;
    });
  };

  const onDirect = (): void => {
    void guard(async (assertCurrent) => {
      const rpc = await app.getRpc(chainId);
      assertCurrent();
      await verified(rpc);
      assertCurrent();
      if (loaded === undefined || rpc === undefined || balance === undefined) throw new Error('state');
      const dest = checkDestination(destination, target.owner, loaded);
      const res = await directSweep({ target, manifest: loaded, destination: dest, amount: balance, rpc });
      setHash(res.hash);
      app.announce('Sweep broadcast.');
      return true;
    });
  };

  const cancelVaultCheck = (): void => {
    authEpoch.current += 1;
    setVaultPass('');
    setError('Vault check cancelled.');
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
      <ManifestBanner manifest={manifest} />
      {manifest !== undefined && loaded === undefined && <Notice kind="warn">Payments disabled on this chain: no deployment manifest is loaded.</Notice>}
      {tokenAddr !== 'native' && tokenCfg === undefined && <Notice kind="error">This token is not on the allowlist. It will not be swept from here.</Notice>}
      <Notice kind="warn" title="The payer can follow this sweep">
        The payer knows the one-time address. When you move its funds, the destination and everything else that address has received or will receive are public and linkable. Use a fresh destination for each sweep, and avoid an address already known to be yours if you do not want to link those funds. A relayer also sees your IP address (hashed), amount and timing. Your stealth key is derived in memory for this action and is never shown or stored.
      </Notice>

      <div className="stack">
        <Field label="Destination address (your own wallet)">{(id) => <input id={id} spellCheck={false} value={destination} onChange={(e) => { setDestination(e.target.value); setQuote(undefined); }} placeholder="0x…" />}</Field>
        {vaultState === 'saved' && (
          <Field label="Vault passphrase (required for each sweep action)" hint="Checked against the encrypted vault and the seller keys currently loaded. It is cleared after every action.">
            {(id, d) => <input id={id} aria-describedby={d} type="password" autoComplete="current-password" value={vaultPass} onChange={(e) => { setVaultPass(e.target.value); }} />}
          </Field>
        )}
        {vaultState === 'checking' && <p role="status">Checking encrypted vault status…</p>}
        {vaultState === 'error' && <Notice kind="error">Could not check encrypted vault storage, so sweep signing is disabled until storage is available.</Notice>}
        {loaded !== undefined && (
          <CameraImporter
            label="Import destination QR"
            onText={(text) => {
              try {
                const checked = checkDestination(text, target.owner, loaded);
                setDestination(checked);
                setQuote(undefined);
                setError(undefined);
                return true;
              } catch (e) {
                setError(userMessage(e));
                return false;
              }
            }}
          />
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
            <button type="button" className="btn" onClick={onQuote} disabled={busy || !relayerOk || balance === undefined || balance === 0n}>Get relayer quote</button>
            {quote !== undefined && (
              <div className="panel">
                <p>Relayer fee: {formatUnits(quote.quote.fee, decimals)} {symbol}, to <Mono>{quote.quote.feeTo}</Mono></p>
                <p>You receive: {formatUnits(quote.net, decimals)} {symbol}</p>
                <button type="button" className="btn btn-primary" onClick={onRelay} disabled={busy}>Sign and submit to relayer</button>
              </div>
            )}
          </>
        ) : (
          <button type="button" className="btn btn-primary" onClick={onDirect} disabled={busy || balance === undefined || balance === 0n}>Sign and broadcast directly</button>
        )}
      </div>

      {busy && <p role="status">Working…</p>}
      {busy && vaultPhase === 'authorizing' && <button type="button" className="btn" onClick={cancelVaultCheck}>Cancel vault check</button>}
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
